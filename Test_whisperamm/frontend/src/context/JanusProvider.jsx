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

    const JANUS_SERVER = 'https://130.110.9.51.sslip.io/janus'; // Sostituisci con il tuo server Janus

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

    // 2. Core Actions, ed è qui che finalmente si parla con RTCPeerConnection!
    const publishOwnFeed = useCallback((useAudio) => {
        if (!videoroomHandleRef.current) return;
    
        console.log("🎥 Richiesta permessi media e creazione offerta...");
    
        videoroomHandleRef.current.createOffer({ //Ecco la createOffer, questa come callback ha preparewebRtc che a sua volta farà la getUsermedia!!!!
        // 1. CREATE OFFER & LOCAL SETUP
            // janus.js qui chiama internamente 'prepareWebRTC':
            // a) Esegue getUserMedia (chiede permessi Cam/Mic).
            // b) Crea l'oggetto RTCPeerConnection.
            // c) Aggiunge le tracce audio/video allo stream.
            // d) Chiama createOffer (genera SDP) e setLocalDescription.
            
            // Appena fatta la setLocalDescription, il browser inizia a cercare i candidati ICE (IP/Porte)
            // e fa scattare l'evento onicecandidate. Se Trickle è attivo, l'SDP qui sotto è "spoglio" 
            // e i candidati verranno inviati separatamente man mano che vengono trovati.
            media: { //E' l'offerta
                audioRecv: false, 
                videoRecv: false, 
                audioSend: useAudio, 
                videoSend: true 
            },
            success: (jsep) => { // 2. CALLBACK SUCCESS (SDP PRONTO)
                //Qui è il CLIENT che è pronto, non il server!
                // Abbiamo l'SDP Locale in mano (jsep) e siamo pronti a spedirlo.
                console.log("✅ Offerta SDP creata, invio PUBLISH...");
                const publish = { request: "publish", audio: useAudio, video: true };  

                //// INVIO AL SERVER (SIGNALING)
                videoroomHandleRef.current.send({ message: publish, jsep: jsep });
                //Mando l'SDP sempre tramite HTTP a sto punto a quanto pare alla room in cui sono entrato
                //questo perchè ho fatto join poco prima

                /* COSA SUCCEDE NELLA .send():
                   
                   A) IL VIAGGIO (HTTP POST):
                      Inviamo un JSON all'URL del server Janus (/janus/<session>/<handle>).
                    
        POST /janus/12345678/98765432 HTTP/1.1
        Content-Type: application/json

        {
          "janus": "message",
          "transaction": "A1B2C3D4",
          "body": {
            "request": "publish",     // <--- L'intenzione
            "audio": true,
            "video": true
          },
          "jsep": {                   // <--- L'allegato tecnico (SDP)
            "type": "offer",
            "sdp": "v=0\r\no=- 48573847... IN IP4 192.168.1.5..." 
          }
        }

                      Il server Janus Core riceve, vede l'handleID e passa tutto al Plugin VideoRoom.
                   
                   B) LATO SERVER (Janus C++):
                      1. Riceve l'offerta (JSEP Offer).
                      2. Applica setRemoteDescription (impara i tuoi IP/Codec).
                      3. Genera la risposta (createAnswer) con i SUOI candidati IP (Janus ha IP pubblico fisso).
                      4. Applica setLocalDescription.
                      5. Spedisce indietro la JSEP Answer.
                   
                   C) IL RITORNO (HTTP RESPONSE o EVENTO):
                      Janus.js riceve la risposta (spesso tramite l'evento asincrono del Long Polling 
                      accoppiato tramite Transaction ID).
                      
                      -> Questo scatena la tua callback 'onJanusMessage' nel componente.
                      -> Lì chiami 'handleRemoteJsep(jsep)'.
                      -> Janus.js esegue internamente: pc.setRemoteDescription(answer).
                      
                   D) CONNECTIVITY CHECK (P2P):
                      Ora che il browser ha l'SDP Remoto (con l'IP di Janus), inizia a bombardare 
                      quell'IP con pacchetti UDP (STUN requests).
                      Quando Janus risponde -> STATE: CONNECTED -> EVENTO: WEBRTCUP.

                      E' solo a questo punto che passiamo a DTLS Handshake --> finalmente SRTP verso il mediaServer
                */
            
                setTimeout(() => {
                    const handle = videoroomHandleRef.current;
                    if (handle && handle.webrtcStuff && handle.webrtcStuff.myStream) {
                        //Quando janus.js accende la tua webcam (durante createOffer), si tiene il flusso video (MediaStream) per sé, 
                        // nascosto dentro un oggetto interno un po' brutto chiamato webrtcStuff. 
                        // React, però, non sa nulla di questo oggetto interno. 
                        // React conosce solo il suo stato (localStream).
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


    //Avviata da front-end, è solo qui che si entra nella room, ovviamente interagendo mediante la sessione creata con l'istanza plugin VideoRoom!
    const joinRoom = useCallback((roomId, display) => {
        if (!videoroomHandleRef.current) return; 
        //Controlla il pluginHandle ottenuto con l'attach, se non ce l'ha eh ti fotti praticamente
        //Senza handle non si cantano messe come si suol dire..
        
        const numericRoomId = typeof roomId === 'number' ? roomId : stringToIntegerId(roomId); 
        //Janus vuole che i roomID siano numeri interi dunque uso sta funzione per pulire le stringhe dei roomId
        if (isNaN(numericRoomId)) {
            setError("ID Stanza non valido");
            return;
        }
        currentRoomIdRef.current = numericRoomId;
        const register = { //Costruzione del messaggio JSON da inviare al server
            request: "join", //Azione
            room: numericRoomId, //Destinazione, dove voglio entrare
            ptype: "publisher", //Non entro da subscriber solo, ma come publisher dato che voglio sicuramente  trasmettere
            display: display || user?.username || "User"  //Nome che vedranno gli altri sul server janus
        };
        videoroomHandleRef.current.send({ message: register }); //Mandiamo al server
        //send è un wrapper dunque la richiesta o è webSocket o HTTP, ma dato che dall'inizio abbiamo lavorato con HTTP, allora questa sarà una POSt e conseguentemente ci sarà una Long Poll, dato che
        //il server ci risponderà con un'ACk alla POSt e necessita di un modo per poterci aggiornare sull'evento 'joined', e per farlo sfrutta la LongPoll
//A questa LongPoll seguirà la risposta del server, come 'joined' se la stanza era già stata creata e il server dunque risponde alla richiesta GET della LongPoll con il Json dell'evento
//oppure, se sono il primo e non c'è ancora quella room, mi risponderà con un altro evento (di errore)

//Ricevuto questo json di risposta, dato che tutto è associato all'oggetto videoRoomHandleRef, ricordiamo essere l'handle verso l'istanza VideoRoom con cui siamo collegati su Janus Server
//la libreria janus.js prenderà l'handleID dalla risposta, cerca nella sua Mappa[handleID] e chiamerà la funzione corrispettiva all'evento onMessage --> a sua volta chiama onJanusMessage!!!!

        //Questa azione non avvia direttamente i flussi multimediali, ma innesca la negoziazione e il successo verrà notificato da un evento joined gestito dalla callback onJanusMessage
    }, [user]);


    //Messaggio HTTP per creare la Room e nel caso fare la Join Room
    const createRoomAndJoin = useCallback(() => {
        const roomId = currentRoomIdRef.current; //Già sistemato dalla Join precedente!
        if (!roomId) return;
        const create = {
            request: "create",
            room: roomId, //Id numerico della stanza
            permanent: false, //Quaando si svuota distruggila!
            description: "Whisperamm Room",
            publishers: 11, //al massimo 11 persone possono trasmettere il video contemporaneamente

            is_private: false //stanza pubblica, può essere utile successivamente per sviluppi futuri!
        };
        videoroomHandleRef.current.send({ 
            message: create,
            success: (result) => { //Callback di send, nel caso in cui si crea correttamente la stanza va di joinRoom
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
            const receivers = internals.pc.getReceivers(); //PC foss proprio RTCPeerConnection!!
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
    const subscribeToRemoteFeed = useCallback((id, display, room) => {
        if (remoteFeedsRef.current[id]) return; 
      
        //Quello che facciamo è ottenere nuovi handle, uno per ogni nuovo RTCPeerConnection da creare
        //In questo caso, abbiamo usato un approccio legacy, dunque tanti RTCPeerConnection quanti sono i flussi che il server ci deve inviare
        janusRef.current.attach({  
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current,
            success: (pluginHandle) => { 
                // Janus ha creato:
        // 1. Un Handle ID sul server (es: 8472947294)
        // 2. Un oggetto pluginHandle nel browser
        // 3. pluginHandle.webrtcStuff = { pc: null, myStream: null, ... }
                remoteFeedsRef.current[id] = pluginHandle; //Lo salviamo nella mappa degli handler
                pluginHandle.send({  //Queste connessioni semplicemente vogliono entrare da subscriber
                    message: { request: "join", room: room, ptype: "subscriber", feed: id } 
                });
                //Al momento non stiamo ancora parlando di RTCPeerConnection..
                //Io, questo handle, voglio ricevere lo stream del publisher con ID X
            },

//L'ultima send è una POST, dunque il Janus Server la riceve, riceverà un ACK immediato il browser, e avvia una Long Poll in backGround
//Dunque il server elabora preparando l'SDP e riceve risposta ottenendo indietro l'offer SDP.
//Dunque, janus.js appena riceve la risposta fa handleEvent(event); e questa funzione prende l'handleID, lo cerca nella Map[handleID], ne estrae 
//i dati, dunque msg e jsep e chiama la callback onmessage, che abbiamo passato noi nella definizione dell'attach!
            error: (err) => console.error("❌ Errore attach subscriber:", err),
            onmessage: (msg, jsep) => { 
                console.log("📨 Evento asincrono ricevuto (Long Poll):", msg);
                //Dunque accade il contrario, è l'RTCPeerConnection del server ad avviare la negoziazione
                if (jsep) {
                    remoteFeedsRef.current[id].createAnswer({ //RTCPeerConnection dunque il setRemote, crea l'sdp e fa setLocalDescription
                        //dunque poi lo manda indietro al peer chiamante
                        jsep: jsep,
                        media: { audioSend: false, videoSend: false },
                        success: (jsep) => { //La creazione dell'SDP è asincrona, se va tutto ok va rimandata
                            remoteFeedsRef.current[id].send({ 
                                message: { request: "start", room: room }, 
                                jsep: jsep //Mandiamo anche il jsep appena creato
                            });
                             // A questo punto:
                                // - RTCPeerConnection esiste ✅
                                // - Ma NON ha ancora stream ❌
                                // - Stato: "connecting", dato che devono partire i candidati ICE ecc..

                            //Ad un certo punto si stabilirà la connessione, iceConnectionState= "connected, e arrivano i pacchetti SRTP sulla rete"
                            //Dopo aver mandato l'answer, lo stream arriva automaticamente tramite il callback ontrack.    

                            /*
                                1. RETE
                                   Pacchetti SRTP arrivano via UDP
                                   ↓
                                2. BROWSER (Stack WebRTC in C++)
                                   - Decifra SRTP
                                   - Decodifica video (H.264/VP8)
                                   - Crea MediaStreamTrack
                                   - SCATTA EVENTO: pc.ontrack ⚡
                                   ↓
                                3. JANUS.JS
                                   Cattura pc.ontrack nativo
                                   Chiama la tua callback
                                   ↓
                                4. TUO CODICE
                                   ontrack: (track) => { ... } viene eseguito
                            */

                            //Serve solo come fallBack nel caso in cui ho browser vecchi che non fanno ontrack
                            //oppure onTrack magari arriva prima di aver registrato la callback effettiva ontrack all'handle
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
        const updateState = setter || setRemoteStreams; //Di default setRemoteStreams, ma se voglio usarlo per un'altra lista..
        updateState(prev => { //Accedo allo stato corrente
            const index = prev.findIndex(p => p.id === id); //Verifica se già c'è qualcuno con questo ID
            if (index !== -1) { //Se non lo trova index =-1
                const newArr = [...prev]; 
                newArr[index] = { id, display, stream }; //Update con questo nuovo array a cui aggiungiamo nuovo stream
                return newArr;
            }
            return [...prev, { id, display, stream }];
        });
    };

    const onJanusMessage = useCallback((msg, jsep) => {
        //Ogni volta che Janus ha qualcosa da dirci viene chiamata questa funzione..
        //o meglio, ogni volta che ci risponde alla GET che gli abbiamo inviato che funge da appiglio per farci rispondere (nsomm semp a Long Poll)
        const event = msg["videoroom"];
        if (event) {
            if (event === "joined") { 
                //Scatta appena il server conferma che sei entrato nella Room, ovvero dopo aver fatto JoinRoom ed è arrivato la risposta alla richiesta di 'join'
                //che rigira un mex (a causa di un altra richiesta GET che viene inviata per Long Poll) che scatena l'evento joined e dunque parte la chiamata a publishOwnFeed
                publisherIdRef.current = msg["id"]; //Server assegna al publisher un id numerico univoco
                setStatus('joined'); 

                publishOwnFeed(true);  //True è il parametro che viene mandato
                //Cioè inizialmente tutti possono parlare
        
                if (msg["publishers"]) {
                    for (let f of msg["publishers"]) subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                //Se nella room c'è gente prima, il server ci manda pure una lista e per ognuno facciamo subscribeToRemoteFeed 
                //per poterr vedere i loro video.
                }

            } else if (event === "event") { //Per gestire eventi più generici che accadono quando io sono già dento
                if (msg["publishers"]) { //Se arrivano nuovi utenti
                    for (let f of msg["publishers"]) subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    //Quando qualcuno entra in stanza, scatta event e nel msg se c'è publishers vuol dire che c'è un nuovo utente, magari anche di più contemporaneamente, ecco perchè itero su un vettore.
                    
                } else if (msg["leaving"] || msg["unpublished"]) { //Se qualcuno chiude il browser o la video camera
                    //il server janus manda indietro questo messaggio!
                    const leavingId = msg["leaving"] || msg["unpublished"];
                    if (leavingId !== 'ok') {
                        setRemoteStreams(prev => prev.filter(p => p.id !== leavingId)); //pulizia grafica
                        //Rimuove il video di x con id=leavingId dall'array di stato
                        if (remoteFeedsRef.current[leavingId]) {
                            remoteFeedsRef.current[leavingId].detach(); //Prendo l'handler preciso di quello stream e lo stacca.
                            delete remoteFeedsRef.current[leavingId];
                        }
                    }
                } else if (msg["error"]) {
                    if (msg["error_code"] === 426) createRoomAndJoin(); 
                    //Dopo la join, che è l'entrypoint da Lobby, dunque se mi torna indietro questo evento on janusMessage 
                    //chiama la funzione createRoomAndJoin.. forse potremmo ottimizzarlo e chiamarlo direttamente all'atto della crea Stanza
                    //Errore 426: Significa "La stanza non esiste". Il codice è intelligente: se la stanza non c'è, 
                    //prova a crearla al volo chiamando createRoomAndJoin.

                    //Questo è semplicemente la risposta al messaggio HTTP join mandato all'handle, non interviene ancora RTCPeerConnection
                }
            }
        }
        
        //Se è arrivato il contenuto del msg, l'SDP che arriva dal Server
        if (jsep) videoroomHandleRef.current.handleRemoteJsep({ jsep: jsep });
        //Questo serve per impostare i parametri tecnici, SDP Answer, nel browser
        //Va fatto solo in fase di negoziazione, ecco perchè if(jsep.)

        
    }, [publishOwnFeed, subscribeToRemoteFeed, createRoomAndJoin]);




    //Fin qui stiamo sempre facendo comunicazione con Janus solo con scambio di JSON tramite HTTP, non c'è ancora alcun oggetto RTCPeerConnection!!
    const attachVideoRoomPlugin = useCallback((janusInstance) => { //La janusInstance foss la connessione con il core Janus
        
        //Praticamente stiamo mandando un messaggio JSON al server tramite la sessione appena creata, per dirgli di avviare una connessione con l'istanza del plugin VideoRoom che gira sul server janus!
        //E' proprio un'istanza singleton che gira su janus server!
        janusInstance.attach({ 
            plugin: "janus.plugin.videoroom", 
            opaqueId: opaqueId.current, //Etichetta casuale generata a caso (non penso serva)

            //Dunque il serve risponderà con il pluginHandle, che avrà HandleID per poter parlare con il plugin videoRoom!
//Janus qui crea un oggetto VideoRoom nella sua RAM per gestire la videoRoom e ci restituisce l'HandleID nell'oggetto pluginHandle che useremo per parlare con VideoRoom.            
            success: (pluginHandle) => { //Se il server risponde: ok plugin agganciato ....
                videoroomHandleRef.current = pluginHandle //Ci salviamo il pluginHandle, che ci consente di gestire la sessione direttamente con videoRoom
                //Questo videoRoomHandleRef sarà il nostro punto con cui interagiremo con videoRoom creata da Janus
                setIsJanusReady(true); //Ora la lobby sa che può lanciare anche il comando joinRoom
                setStatus('connected');
            },
            error: (err) => {
                setError("Errore attach plugin");
            },

            //Durante la newJanusAPI ricordiamo che era partita una LongPoll, per cui quando janus ci risponderà con un messaggio allora viene chiamata questa callback
            //Quando il browser riceve la risposta, che sarà identificata con l'HandleID che risponde (l'istanza videoRoom creata da Janus), internamente al browser si verifica
            //chi è l'handler per quell'istanza, dunque trova l'oggetto pluginHandle!
            onmessage: (msg, jsep) => onJanusMessage(msg, jsep), 

            //RICORDA: FINORA ANCORA NON SONO NEMMENO ENTRATO NELLA VIDEO ROOM e dunque NON HO NEMMENO ANCORA CREATO un RTCPeerConnection!!!!!


            //Questi eventi fondamentalmente servono per react, non per webRTC!
//Tutte le callback vengono salvate nell'oggetto pluginHandle, inserendole in una hashmap: Map[handleID]={onMessage: .., onremoteStream: ..}
//Quando succede un evento relativo a quel HandleID dunque si prende l'handler corrispondente che ho definito!
            onlocalstream: (stream) => { if (stream) setLocalStream(stream); },
            //Questo evento parte quando daremo la publishOwnFeed, ed è importante per settare il localStream (oggetto React)

            
            //RIMOZIONE
            //onremotestream: (stream) => { }, //Questo secondo me non serve proprio, si può togliere       
            oncleanup: () => setLocalStream(null)
        });
    }, [onJanusMessage]);


    //Qui il browser comincia a parlare con il Core di Janus e successivamente con il PluginVideoRoom
    //Qui stiamo facendo SIGNALLING, non stiamo ancora usando l'RTCPeer, qui agiamo facendo semplicemente delle richieste HTTP (XMLHttpRequest)
    const createJanusSession = useCallback(() => { 
        setStatus('connecting'); //Per qualche feedback visivo mi sa
        const JanusAPI = Janus; 

        //Con questo, creiamo solo la comunicazione base con il core Janus.
        const janus = new JanusAPI({ //Fa partire una richiesta POST verso l'indirizzo JANUS_SERVER
            server: JANUS_SERVER,
/*
            POST /janus HTTP/1.1
            {
            "janus": "create", comando che dice al server che c'è un utente che vuole collegarsi
            "transaction": "A1b2C3d4..."  stringa generata dal browser per tracciare questa richiesta
            }

    La risposta che mi viene restituita è una cosa di questo tipo: 

            HTTP/1.1 200 OK
            {
                "janus": "success",
                "transaction": "A1b2C3d4...",
                "data": {
                    "id": 8394051123456789  <-- Questo è il Session ID, che è salvato nell'oggetto janus.
                }
            }

    Q

*/
            success: () => { 
    //Se il server accetta la connessione, la libreria janus.js chiama la callback success 
    //che definiamo noi e automaticamente lancia in parallelo una richiesta HTTP verso il server per fare Long Poll

//Perchè serve il Long Poll?
//eh se tipo il core ci vuole dire che la connessione è andata a terra.. (Vedi janus.js handleEvent), anche perchè non siamo ancora nella Room.
//il meccanismo però ci servirà per ricevere ogni tipo di evento asincrono, come il join di qualcuno nella room (che ancora non abbiamo creato)

                janusRef.current = janus;  //Qui salviamo il SessionID
                //Usiamo ref, vedi sopra perchè
                attachVideoRoomPlugin(janus); //Plugin VideoRoom, fondamentale per creare la sessione con il Plugin VideoRoom di Janus!
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

        //JanusAPI.init ci fa parlare con il nostro browser.
        JanusAPI.init({ 
            debug: "all", //Attiva i log nella console del browser
            dependencies: JanusAPI.useDefaultDependencies({ adapter: adapter }),
            //Adapter, import fatto livella le differenze tra i vari browser.
            callback: () => { //Finita la init, c'è questa callback
                if (!JanusAPI.isWebrtcSupported()) { //Verifica se il browser implementa webRTC
                    //Se l'utente sta usando InternetExplorer..
                    setError("WebRTC non supportato");
                    return;
                }
                //Se è andato tutto bene allora avviamo la connessione..
                createJanusSession();
            }
        });
    }, [isJanusReady, createJanusSession]);


        const toggleAudio = useCallback((shouldEnable) => {
            if (!videoroomHandleRef.current) return;
            
            // Se stiamo attivando l'audio, assicuriamoci che la traccia locale sia attiva
            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) audioTrack.enabled = shouldEnable;
            }
        
            // COMANDO AL SERVER JANUS
            // Diciamo a Janus di processare o ignorare il nostro audio
            const configureRequest = {
                request: "configure",
                audio: shouldEnable // true = Parla, false = Muto
            };
            
            // Diciamo a Janus: "Ignora qualsiasi audio ti arrivi da me".
            videoroomHandleRef.current.send({ 
                message: configureRequest,
                success: (result) => {
                    console.log(`🎤 Audio impostato su: ${shouldEnable ? "ON" : "OFF"}`);
                },
                error: (err) => {
                    console.error("Errore cambio stato audio:", err);
                }
            });
        }, [localStream]);

    useEffect(() => { return () => cleanup(); }, [cleanup]);

    const value = {
        isJanusReady, status, error, localStream, remoteStreams, initializeJanus, joinRoom, cleanup,toggleAudio
    };

    return (
        <JanusContext.Provider value={value}>{children}</JanusContext.Provider>
    );
};