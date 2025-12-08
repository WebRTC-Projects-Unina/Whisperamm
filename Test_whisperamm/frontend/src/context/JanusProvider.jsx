import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import Janus from '../utils/janus'; 
import { useAuth } from './AuthProvider';
import { stringToIntegerId } from '../utils/helper';

export const JanusContext = createContext();

export const JanusProvider = ({ children }) => {
    const { user } = useAuth();
    
    const [isJanusReady, setIsJanusReady] = useState(false);
    const [status, setStatus] = useState('disconnected'); 
    const [error, setError] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState([]);

    const janusRef = useRef(null);
    const videoroomHandleRef = useRef(null);
    const opaqueId = useRef(`videoroom-${Janus.randomString(12)}`);
    const currentRoomIdRef = useRef(null);
    const remoteFeedsRef = useRef({});
    const publisherIdRef = useRef(null);

    const JANUS_SERVER = 'http://130.110.9.51:8088/janus'; 

    // 1. Cleanup (Memoizzato per evitare loop infiniti nei useEffect dei consumatori)
    const cleanup = useCallback(() => {
        Object.values(remoteFeedsRef.current).forEach(handle => {
            try { handle.detach?.(); } catch (err) { console.warn(err); }
        });
        remoteFeedsRef.current = {};
        publisherIdRef.current = null;
        if (janusRef.current) {
            janusRef.current.destroy();
            janusRef.current = null;
        }
        setLocalStream(null);
        setRemoteStreams([]);
        setIsJanusReady(false);
        setStatus('disconnected');
    }, []);

    // 2. Core Actions (Memoizzate)
    // Nel file context, aggiorna questa funzione
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
            
                // --- FORZATURA STREAM LOCALE ---
                // A volte onlocalstream non scatta, ma lo stream esiste internamente.
                // Lo andiamo a prendere manualmente.
                setTimeout(() => {
                    const handle = videoroomHandleRef.current;
                    // Janus salva lo stream locale in webrtcStuff.myStream
                    if (handle && handle.webrtcStuff && handle.webrtcStuff.myStream) {
                        console.log("🔥🔥🔥 FORCE: Stream Locale trovato manualmente!");
                        setLocalStream(handle.webrtcStuff.myStream);
                    } else {
                        console.log("⚠️ Stream locale non ancora trovato in webrtcStuff...");
                    }
                }, 1000); // Controllo dopo 1 secondo
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
            console.error("❌ Room ID non valido:", roomId);
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
        
        console.log(`🔵 Tentativo join room: ${numericRoomId}`);
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
                console.log("✅ Stanza creata:", result);
                joinRoom(roomId, user?.username); 
            },
            error: (err) => {
                console.error("❌ Impossibile creare la stanza:", err);
                setError("Impossibile creare la stanza video.");
            }
        });
    }, [joinRoom, user]);

    const forceStreamUpdate = (pluginHandle, id, display, setRemoteStreams) => {
        // Tentativo 1: Accesso diretto all'oggetto interno di janus.js
        const internals = pluginHandle.webrtcStuff;

        if (internals && internals.remoteStream) {
            console.log(`🔥🔥🔥 FORCE: Stream trovato in webrtcStuff per ${display}!`);
            // Usiamo la logica di aggiornamento esistente
            gestisciStream(internals.remoteStream, id, display, setRemoteStreams);
            return true;
        }

        // Tentativo 2: Estrazione dal PeerConnection
        if (internals && internals.pc) {
            const receivers = internals.pc.getReceivers();
            if (receivers && receivers.length > 0) {
                console.log(`🔥🔥🔥 FORCE: Ricostruzione stream dai receivers per ${display}`);
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

    const subscribeToRemoteFeed = useCallback((id, display, room) => {
        if (remoteFeedsRef.current[id]) return;

        console.log(`🔌 Inizio attach plugin per subscriber: ${display} (${id})`);

        janusRef.current.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current,

            success: (pluginHandle) => {
                console.log(`✅ Plugin attached! Handle ID: ${pluginHandle.getId()}`);
                remoteFeedsRef.current[id] = pluginHandle;

                pluginHandle.send({ 
                    message: { request: "join", room: room, ptype: "subscriber", feed: id } 
                });
            },

            error: (err) => console.error("❌ Errore attach:", err),

            onmessage: (msg, jsep) => {
                if (jsep) {
                    remoteFeedsRef.current[id].createAnswer({
                        jsep: jsep,
                        media: { audioSend: false, videoSend: false },
                        success: (jsep) => {
                            console.log("✅ Answer creata, start...");
                            remoteFeedsRef.current[id].send({ 
                                message: { request: "start", room: room }, 
                                jsep: jsep 
                            });

                            // --- MODIFICA CRITICA: FORZATURA DOPO L'ANSWER ---
                            // Aspettiamo un attimo che la connessione si stabilisca e poi "rubiamo" lo stream
                            setTimeout(() => {
                                forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                            }, 1500); // Check a 1.5 secondi

                            setTimeout(() => {
                                forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                            }, 3000); // Check di riserva a 3 secondi
                        },
                        error: (err) => console.error("❌ WebRTC error:", err)
                    });
                }

                // Se riceviamo conferma "started", proviamo subito
                if (msg["started"] === "ok" || (msg["videoroom"] === "event" && msg["started"] === "ok")) {
                     console.log(`⚡ Evento STARTED ricevuto per ${display}, provo estrazione...`);
                     setTimeout(() => {
                         forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                     }, 500);
                }
            },

            // Lasciamo comunque i callback standard per sicurezza
            ontrack: (track, mid, on) => {
                console.log(`🚀 ONTRACK (Standard) per ${display}`);
                const stream = track.streams ? track.streams[0] : new MediaStream([track]);
                gestisciStream(stream, id, display, setRemoteStreams);
            },

            onremotestream: (stream) => {
                console.log(`🎥 ONREMOTESTREAM (Legacy) per ${display}`);
                gestisciStream(stream, id, display, setRemoteStreams);
            },

            oncleanup: () => {
                setRemoteStreams(prev => prev.filter(p => p.id !== id));
                delete remoteFeedsRef.current[id];
            }
        });
    }, []);

    // Funzione di supporto modificata
    const gestisciStream = (stream, id, display, setter) => {
        // Se usi la funzione dentro il componente usa direttamente setRemoteStreams
        // Se la usi fuori, usa "setter"
        const updateState = setter || setRemoteStreams;

        updateState(prev => {
            const index = prev.findIndex(p => p.id === id);
            if (index !== -1) {
                console.log(`🔄 Aggiorno stream esistente per ${display}`);
                const newArr = [...prev];
                newArr[index] = { id, display, stream }; 
                return newArr;
            }
            return [...prev, { id, display, stream }];
        });
    };

    // 3. Internal Callbacks (Dependent on Core Actions)
    const onJanusMessage = useCallback((msg, jsep) => {
        const event = msg["videoroom"];

        if (event) {
            if (event === "joined") {
                console.log("✅ Entrato nella stanza! ID:", msg["id"]);

                // 1. Salviamo il nostro ID e lo stato
                publisherIdRef.current = msg["id"];
                setStatus('joined');

                // 2. Pubblichiamo il nostro stream (così gli altri ci vedono)
                publishOwnFeed(true);

                // 3. Ci abboniamo ai publisher GIA' presenti nella stanza
                if (msg["publishers"]) {
                    const list = msg["publishers"];
                    console.log("👥 Trovati publisher esistenti:", list);
                    for (let f of list) {
                        const id = f["id"];
                        const display = f["display"];
                        // Ci abboniamo a ognuno di loro
                        subscribeToRemoteFeed(id, display, msg["room"]);
                    }
                }
            } 
            else if (event === "event") {
                // 4. Gestione di NUOVI publisher che arrivano DOPO di noi
                if (msg["publishers"]) {
                    const list = msg["publishers"];
                    console.log("🔔 Nuovo publisher arrivato:", list);
                    for (let f of list) {
                        subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    }
                } 
                else if (msg["leaving"] || msg["unpublished"]) {
                    // 5. Qualcuno se ne va o smette di trasmettere
                    const leavingId = msg["leaving"] || msg["unpublished"];
                    if (leavingId !== 'ok') {
                        console.log("👋 Utente uscito:", leavingId);
                        setRemoteStreams(prev => prev.filter(p => p.id !== leavingId));
                        if (remoteFeedsRef.current[leavingId]) {
                            remoteFeedsRef.current[leavingId].detach();
                            delete remoteFeedsRef.current[leavingId];
                        }
                    }
                } 
                else if (msg["error"]) {
                    console.error("❌ Errore VideoRoom:", msg["error"]);
                    // Gestione autcreate se la stanza manca
                    if (msg["error_code"] === 426) {
                        createRoomAndJoin();
                    }
                }
            }
        }

        // Gestione JSEP (Risposte SDP)
        if (jsep) {
            videoroomHandleRef.current.handleRemoteJsep({ jsep: jsep });
        }
    }, [publishOwnFeed, subscribeToRemoteFeed, createRoomAndJoin]);


    const attachVideoRoomPlugin = useCallback((janusInstance) => {
        janusInstance.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current,
            success: (pluginHandle) => {
                console.log("✅ Plugin VideoRoom attaccato (Publisher)");
                videoroomHandleRef.current = pluginHandle;
                setIsJanusReady(true);
                setStatus('connected');
            },
            error: (err) => {
                console.error("❌ Errore attach plugin:", err);
                setError("Errore attach plugin");
            },
            onmessage: (msg, jsep) => {
                onJanusMessage(msg, jsep);
            },
            // --- GESTIONE STREAM LOCALE ---
            onlocalstream: (stream) => {
                console.log("🎥 ONLOCALSTREAM scattato!", stream);
                // Questo serve per dare un feedback visivo immediato
                if (stream) {
                    setLocalStream(stream);
                }
            },
            // Aggiungiamo anche onremotestream qui per sicurezza (anche se per il publisher handle solitamente non serve)
            onremotestream: (stream) => {
                console.log("🎥 ONREMOTESTREAM sul publisher handle (ignorato)", stream);
            },
            oncleanup: () => {
                console.log("🧹 Cleanup Publisher");
                setLocalStream(null);
            }
        });
    }, [onJanusMessage]);

    const createJanusSession = useCallback(() => {
        setStatus('connecting');
        const janus = new Janus({
            server: JANUS_SERVER,
            success: () => {
                janusRef.current = janus;
                attachVideoRoomPlugin(janus);
            },
            error: (err) => {
                console.error("❌ Errore Janus:", err);
                setError("Errore connessione Janus");
                setStatus('error');
            },
            destroyed: () => setStatus('disconnected')
        });
    }, [attachVideoRoomPlugin]);

    const initializeJanus = useCallback(() => {
        if (isJanusReady) return;
        Janus.init({
            debug: "all",
            callback: () => {
                if (!Janus.isWebrtcSupported()) {
                    setError("WebRTC non supportato");
                    return;
                }
                createJanusSession();
            }
        });
    }, [isJanusReady, createJanusSession]);

    // Cleanup on unmount
    useEffect(() => { return () => cleanup(); }, [cleanup]);

    const value = {
        isJanusReady,
        status,
        error,
        localStream,
        remoteStreams,
        initializeJanus,
        joinRoom,
        cleanup
    };

    return (
        <JanusContext.Provider value={value}>{children}</JanusContext.Provider>
    );
};