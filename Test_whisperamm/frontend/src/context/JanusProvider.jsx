import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import adapter from 'webrtc-adapter'; 
import { useAuth } from './AuthProvider';
import { stringToIntegerId } from '../utils/helper';
import Janus from '../utils/janus'; 

/*
    Ogni volta che viene chiamato useState per janus avremmo re-rendering
    dei componenti figli, e dato che sta sopra RouterProvider, verrebbere renderizzati ogni volta
    i sottocomponenti! Lobby, Game ecc.
*/

/*
    Lavoriamo infatti modificando janusRef.current, che non scatena un re-render.
*/

export const JanusContext = createContext();

// Funzione helper per generare string random
const generateRandomString = (len) => {
    const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString = '';
    for (let i = 0; i < len; i++) {
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.charAt(randomPoz);
    }
    return randomString;
};

export const JanusProvider = ({ children }) => {
    const { user } = useAuth();
    
    const [isJanusReady, setIsJanusReady] = useState(false);
    const [status, setStatus] = useState('disconnected'); 
    const [error, setError] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState([]);

    /*
    * Qual è la differenza tra useRef e useState?
    *Ogni volta che aggiorni lo stato (setQualcosa), React ricarica (re-renderizza) il componente e i suoi figli
    * con useRef invece, aggiornando janusRef.current, manteniamo il dato in memoria ma non ridisegno la pagina ad ogni aggiornamento di janusRef
    */
   //Con useRef react crea un oggetto contenitore con una singola proprietà modificabile, ovvero .current!

    const janusRef = useRef(null); 
    const videoroomHandleRef = useRef(null);
    const opaqueId = useRef(`videoroom-${generateRandomString(12)}`);
    const currentRoomIdRef = useRef(null);
    const remoteFeedsRef = useRef({});
    const publisherIdRef = useRef(null);

    const JANUS_SERVER = 'https://nonvillainous-nonsuccessfully-carline.ngrok-free.dev/janus'; // Sostituisci con il tuo server Janus

    // 1. Cleanup
    const cleanup = useCallback(() => {
        Object.values(remoteFeedsRef.current).forEach(handle => {
            try { handle.detach?.(); } catch (err) { console.warn(err); }
        });
        remoteFeedsRef.current = {};
        publisherIdRef.current = null;
        if (janusRef.current) {
            try {
                janusRef.current.destroy();
            } catch (e) { console.warn("Errore destroy janus", e); }
            janusRef.current = null;
        }
        setLocalStream(null);
        setRemoteStreams([]);
        setIsJanusReady(false);
        setStatus('disconnected');
    }, []);

    // 2. Core Actions
    const publishOwnFeed = useCallback((useAudio) => {
        if (!videoroomHandleRef.current) return;
    
        console.log("🎥 Richiesta permessi media e creazione offerta...");
    
        videoroomHandleRef.current.createOffer({
            media: { 
                audioRecv: false, 
                videoRecv: false, 
                audioSend: useAudio, 
                videoSend: true 
            },
            success: (jsep) => {
                console.log("✅ Offerta SDP creata, invio PUBLISH...");
                const publish = { request: "publish", audio: useAudio, video: true };
                videoroomHandleRef.current.send({ message: publish, jsep: jsep });
            
                setTimeout(() => {
                    const handle = videoroomHandleRef.current;
                    if (handle && handle.webrtcStuff && handle.webrtcStuff.myStream) {
                        setLocalStream(handle.webrtcStuff.myStream);
                    }
                }, 1000);
            },
            error: (error) => {
                console.error("❌ WebRTC error:", error);
                setError("Errore WebRTC: " + error.message);
            }
        });
    }, []);

    const joinRoom = useCallback((roomId, display) => {
        if (!videoroomHandleRef.current) return;
        
        const numericRoomId = typeof roomId === 'number' ? roomId : stringToIntegerId(roomId);
        if (isNaN(numericRoomId)) {
            setError("ID Stanza non valido");
            return;
        }
        currentRoomIdRef.current = numericRoomId;
        const register = {
            request: "join",
            room: numericRoomId,
            ptype: "publisher",
            display: display || user?.username || "User"
        };
        videoroomHandleRef.current.send({ message: register });
    }, [user]);

    const createRoomAndJoin = useCallback(() => {
        const roomId = currentRoomIdRef.current;
        if (!roomId) return;
        const create = {
            request: "create",
            room: roomId,
            permanent: false,
            description: "Whisperamm Room",
            publishers: 6,
            is_private: false
        };
        videoroomHandleRef.current.send({ 
            message: create,
            success: (result) => {
                joinRoom(roomId, user?.username); 
            },
            error: (err) => {
                setError("Impossibile creare la stanza video.");
            }
        });
    }, [joinRoom, user]);



    //Io temo che questa cosa non servi
    //E' una funzione di fallback per recuperare manualmente gli streamVideo
    //Invocata dopo un timeout che scatta dopo la negoziazione SDP per mitigare potenziali problemi dove l'evento ontrack 
    // potrebbe non essere gestito correttamente.
    
    //Dunque ispezione proprio nell'oggetto webRtcStuff dell'handle janus e se necessario addirittura arriviamo a interrogare RTCPeerConnection
    //per ricorstruire manualmente un mediaStream
    const forceStreamUpdate = (pluginHandle, id, display, setRemoteStreams) => {
        const internals = pluginHandle.webrtcStuff;
        if (internals && internals.remoteStream) {
            gestisciStream(internals.remoteStream, id, display, setRemoteStreams);
            return true;
        }
        if (internals && internals.pc) {
            const receivers = internals.pc.getReceivers();
            if (receivers && receivers.length > 0) {
                const newStream = new MediaStream();
                let tracksFound = 0;
                receivers.forEach(r => {
                    if (r.track && r.track.readyState === 'live') {
                        newStream.addTrack(r.track);
                        tracksFound++;
                    }
                });
                if (tracksFound > 0) {
                    gestisciStream(newStream, id, display, setRemoteStreams);
                    return true;
                }
            }
        }
        return false;
    };

    //Meccanismo che ci consente di vedere e sentire gli altri 
    //Per gli altri in room va creato un handler per ogni persona!
    const subscribeToRemoteFeed = useCallback((id, display, room) => {
        if (remoteFeedsRef.current[id]) return; 
        //Dato che spesso Janus manda notifiche ripetute, spesso 
        //viene chiamata questa funzione anche se non servirebbe, dunque return.
        
        // Uso janusRef.current (l'istanza creata) per fare attach
        janusRef.current.attach({ //Qui avviene un pò la magia, è un metodo che sta proprio in janus.js, attivabile solo su un'istanza di connessione!
            //creo la strada verso il server e la salvo in janusRef
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current,
            //Creiamo un nuovo plugin handle, non lo stesso che sta già trasmettendo il nostro video
            // ma specifico per ricevere il video dell'utente id.
            success: (pluginHandle) => {
                //Creo il nuovo "figlio" di janusRef, la connessione totale, handle specifico per quel video
                remoteFeedsRef.current[id] = pluginHandle; //Lo salviamo nella mappa degli handler
                pluginHandle.send({ 
                    message: { request: "join", room: room, ptype: "subscriber", feed: id } 
                });
                //Appena è pronto facciamo una richiesta di subscribe al feed di id-user!
            },

            //E' come creare un nuovo canale
            error: (err) => console.error("❌ Errore attach subscriber:", err),
            onmessage: (msg, jsep) => { 
                //Qui il server webRTC ribalta la situazione, non creo io l'offerta come in publishOwnFeed
                //ma devo creare una risposta!
                if (jsep) {
                    remoteFeedsRef.current[id].createAnswer({ 
                        //creo la risposta su quello stesso canale.
                        jsep: jsep,
                        media: { audioSend: false, videoSend: false },

                        //Il serer mi ha mandato l'offerta JSEP, ora con createAnswer scriviamo
                        // una risposta tecnica SDP answer compatibile, senza ancora spedirlo.
                        success: (jsep) => {
                            remoteFeedsRef.current[id].send({ //qui avviene la vera e propria risposta
                             
                                message: { request: "start", room: room }, 
                                jsep: jsep //Mandiamo anche il jsep appena creato
                            });
                            //Timeout per ispezionare manualmente se ci siamo persi l'evento che è arrivato lo stream.
                            setTimeout(() => forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams), 1500); 
                            setTimeout(() => forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams), 3000); 
                        },
                        error: (err) => console.error("WebRTC error:", err)
                    });
                }

                //Non so quanto serva effettivamente sta roba
                if (msg["started"] === "ok" || (msg["videoroom"] === "event" && msg["started"] === "ok")) {
                     setTimeout(() => forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams), 500);
                }
            //Se per caso l'evento automatico non è partito e il video non si vede ancora, 
            //vai a controllare manualmente tra 1.5 secondi (e poi ancora dopo 3 secondi) 
            //se il flusso video è arrivato di nascosto.     
            }, //Appena finita la negoziazione, arriva la traccia!
            ontrack: (track, mid, on) => {
                const stream = track.streams ? track.streams[0] : new MediaStream([track]);
                //Contenitore con più tracce ["audio"+"video"] indipendenti fra loro ma che il browser si assicura siano sincronizzati.
                //Quando chiamiamo getUserMedia il browser accede la cam e restituisce un MediaStream, qui lo stiamo prendendo dallo stream che ci sta arrivando dalla rete
                gestisciStream(stream, id, display, setRemoteStreams); //Ponte verso react
                //li mettiamo nell'array di stato remoteStreams

                //Fondamentale perchè l'evento ontrack recepito dal browser passa la traccia grezza ma il tag <video> html accetta solo MediaStream
                //E' ciò che useremo in VideoPlayer.jsx
            },
            onremotestream: (stream) => { //Residuo delle vecchie versioni di Janus e di webRTC
                gestisciStream(stream, id, display, setRemoteStreams);
            },
            oncleanup: () => {
                setRemoteStreams(prev => prev.filter(p => p.id !== id));
                delete remoteFeedsRef.current[id];
            }
        });
    }, []);

    //Ma da dove escono questi eventi ontrack, onremote stream ecc? 
    //Quando la connessione P2P (tra il browser e il serverJanus a stu punt) riceve pacchetti video, l'oggetto
    //nel broser RTCPeerConnection scatena l'evento track, che è un evento tipo come click o keydown, un evento standard del browser.
    //janus.js ha creato quel RTCPeerConnection e si è messo in ascolto sui suoi eventi, per cui lo cattura e attiverà la funzione onTrack() che gli abbiamo passato
    //facendo quell'.attach().

    //E' un pò come definire gli handler per i vari eventi, sto iniettando delle callback che vengono chiamate quando accadono determinati eventi, il tutto gestito da janus.js


    //Funzione helper per la gestione dello stato React degli stream remoti, implementando una logica di upsert
    const gestisciStream = (stream, id, display, setter) => {
        const updateState = setter || setRemoteStreams;
        updateState(prev => {
            const index = prev.findIndex(p => p.id === id);
            if (index !== -1) {
                const newArr = [...prev];
                newArr[index] = { id, display, stream }; 
                return newArr;
            }
            return [...prev, { id, display, stream }];
        });
    };

    const onJanusMessage = useCallback((msg, jsep) => {
        //Ogni volta che Janus ha qualcosa da dirci viene chiamata questa funzione..
        const event = msg["videoroom"];
        if (event) {
            if (event === "joined") { //Scatta appena il server conferma che sei entrato nella Room (?)
                publisherIdRef.current = msg["id"]; //Server assegna al publisher un id numerico univoco-
                setStatus('joined'); 
                publishOwnFeed(true); 
                if (msg["publishers"]) {
                    for (let f of msg["publishers"]) subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                //Se nella room c'è gente prima, il server ci manda pure una lista e per ognuno facciamo subscribeToRemoteFeed 
                //per poterr vedere i loro video.
                }

            } else if (event === "event") { //Per gestire eventi più generici che accadono quando io sono già dento
                if (msg["publishers"]) { //Se arrivano nuovi utenti
                    for (let f of msg["publishers"]) subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                } else if (msg["leaving"] || msg["unpublished"]) { //Se qualcuno chiude il browser o la video camera
                    const leavingId = msg["leaving"] || msg["unpublished"];
                    if (leavingId !== 'ok') {
                        setRemoteStreams(prev => prev.filter(p => p.id !== leavingId)); 
                        //Rimuove il video di x con id=leavingId dall'array di stato
                        if (remoteFeedsRef.current[leavingId]) {
                            remoteFeedsRef.current[leavingId].detach(); //Prendo l'handler preciso di quello stream e lo stacca.
                            delete remoteFeedsRef.current[leavingId];
                        }
                    }
                } else if (msg["error"]) {
                    if (msg["error_code"] === 426) createRoomAndJoin();
                    //Errore 426: Significa "La stanza non esiste". Il codice è intelligente: se la stanza non c'è, 
                    //prova a crearla al volo chiamando createRoomAndJoin.
                }
            }
        }
        
        //Se è arrivato il contenuto del msg, jsep foss Javascript Session Establishment Protocol, l'SDP che arriva dal Server
        if (jsep) videoroomHandleRef.current.handleRemoteJsep({ jsep: jsep });
        //Questo serve per impostare i parametri tecnici, SDP Answer, nel browser
        //Va fatto solo in fase di negoziazione, ecco perchè if(jsep.)

        
    }, [publishOwnFeed, subscribeToRemoteFeed, createRoomAndJoin]);

    const attachVideoRoomPlugin = useCallback((janusInstance) => {
        //Con questo non entriamo ancora nella room, ma lo rendo pronto a trasmettere!
        janusInstance.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current, //Serve per debugging sul Janus Server
            success: (pluginHandle) => { //Se il server risponde: ok plugin agganciato ..
                videoroomHandleRef.current = pluginHandle //un pò come un telecomando, utile per inviare comandi
                // alla stanza come: entra, pubblica video, muta audio ecc.
                setIsJanusReady(true); //Ora la lobby sa che può lanciare anche il comando joinRoom
                setStatus('connected');
            },
            error: (err) => {
                setError("Errore attach plugin");
            },
            onmessage: (msg, jsep) => onJanusMessage(msg, jsep), //Ogni volta che janus ci manda un mex, lo passiamo a onJanus Message.
            onlocalstream: (stream) => { if (stream) setLocalStream(stream); }, //evento che scatta appena fatto il Join e pubblico il mio video su Janus.
            //In questo modo janus mi restituisce il mio stesso flusso, utile per metterlo nel riquadrino e vedermi da solo!
            onremotestream: (stream) => { }, //Qui ignoriamo gli stream remoti per ora, dato che li gestiremo dopo con subscribeToRemoteFeed.
            oncleanup: () => setLocalStream(null)
        });
    }, [onJanusMessage]);

    const createJanusSession = useCallback(() => {
        setStatus('connecting'); //Per qualche feedback visivo mi sa
        const JanusAPI = Janus; 

        //Qui creiamo l'oggetto che gestisce la connessione!
        const janus = new JanusAPI({
            server: JANUS_SERVER, //Indirizzo HTTP o HTTPs a seconda se siamo in prod o in dev.
            success: () => {
                //Se il server accetta la connessione.
                janusRef.current = janus; 
                //Usiamo ref, vedi sopra perchè
                attachVideoRoomPlugin(janus); //Plugin VideoRoom
                //Chiamato appena il browser riesce a stabilire la connessione fisica HTTPS con il server Janus
            },
            error: (err) => {
                console.error("Errore connessione Janus:", err);
                // Suggerimento errore per l'utente
                if (window.location.protocol === 'https:' && JANUS_SERVER.startsWith('http:')) {
                    setError("Errore Mixed Content: Il sito è HTTPS ma Janus è HTTP.");
                } else {
                    setError("Errore connessione Janus (Network/Server down).");
                }
                setStatus('error');
            },
            destroyed: () => setStatus('disconnected')
        });
    }, [attachVideoRoomPlugin, JANUS_SERVER]);

    const initializeJanus = useCallback(() => {
        if (isJanusReady) return; //Per evitare che se già fatto venga resettato
        const JanusAPI = Janus;

        JanusAPI.init({ 
            //Non connette al server Janus ma prepara l'ambiente browser.
            debug: "all", //Attiva i log nella console del browser
            //Da togliere in proda
            dependencies: JanusAPI.useDefaultDependencies({ adapter: adapter }),
            //Adapter, import fatto livella le differenze tra i vari browser.
            callback: () => { //Finita la init, c'è questa callback
                if (!JanusAPI.isWebrtcSupported()) {
                    //Se l'utente sta usando InternetExplorer..
                    setError("WebRTC non supportato");
                    return;
                }
                //Se è andato tutto bene allora avviamo la connessione..
                createJanusSession();
            }
        });
    }, [isJanusReady, createJanusSession]);

    useEffect(() => { return () => cleanup(); }, [cleanup]);

    const value = {
        isJanusReady, status, error, localStream, remoteStreams, initializeJanus, joinRoom, cleanup
    };

    return (
        <JanusContext.Provider value={value}>{children}</JanusContext.Provider>
    );
};