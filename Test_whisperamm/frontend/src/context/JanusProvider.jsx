import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
import adapter from 'webrtc-adapter'; 
import { useAuth } from './AuthProvider';
import { stringToIntegerId } from '../utils/helper';

export const JanusContext = createContext();

// ✅ Usa Janus dal window object (caricato da script nel HTML)
// Oppure importalo come modulo se hai rimosso lo script
import Janus from '../utils/janus';

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
            janusRef.current.destroy();
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
                        console.log("🔥🔥🔥 FORCE: Stream Locale trovato manualmente!");
                        setLocalStream(handle.webrtcStuff.myStream);
                    } else {
                        console.log("⚠️ Stream locale non ancora trovato in webrtcStuff...");
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
        const internals = pluginHandle.webrtcStuff;

        if (internals && internals.remoteStream) {
            console.log(`🔥🔥🔥 FORCE: Stream trovato in webrtcStuff per ${display}!`);
            gestisciStream(internals.remoteStream, id, display, setRemoteStreams);
            return true;
        }

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

                            setTimeout(() => {
                                forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                            }, 1500); 

                            setTimeout(() => {
                                forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                            }, 3000); 
                        },
                        error: (err) => console.error("❌ WebRTC error:", err)
                    });
                }

                if (msg["started"] === "ok" || (msg["videoroom"] === "event" && msg["started"] === "ok")) {
                     console.log(`⚡ Evento STARTED ricevuto per ${display}, provo estrazione...`);
                     setTimeout(() => {
                         forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                     }, 500);
                }
            },

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

    const gestisciStream = (stream, id, display, setter) => {
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

    const onJanusMessage = useCallback((msg, jsep) => {
        const event = msg["videoroom"];

        if (event) {
            if (event === "joined") {
                console.log("✅ Entrato nella stanza! ID:", msg["id"]);
                publisherIdRef.current = msg["id"];
                setStatus('joined');
                publishOwnFeed(true);

                if (msg["publishers"]) {
                    const list = msg["publishers"];
                    console.log("👥 Trovati publisher esistenti:", list);
                    for (let f of list) {
                        subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    }
                }
            } 
            else if (event === "event") {
                if (msg["publishers"]) {
                    const list = msg["publishers"];
                    console.log("🔔 Nuovo publisher arrivato:", list);
                    for (let f of list) {
                        subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    }
                } 
                else if (msg["leaving"] || msg["unpublished"]) {
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
                    if (msg["error_code"] === 426) {
                        createRoomAndJoin();
                    }
                }
            }
        }
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
            onlocalstream: (stream) => {
                console.log("🎥 ONLOCALSTREAM scattato!", stream);
                if (stream) {
                    setLocalStream(stream);
                }
            },
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
        
        // ✅ Usa window.Janus se caricato da script
        const JanusAPI = Janus;
        
        const janus = new JanusAPI({
            server: JANUS_SERVER,
            success: () => {
                janusRef.current = janus;
                attachVideoRoomPlugin(janus);
            },
            error: (err) => {
                console.error("❌ Errore Janus:", err);
                setError("Errore connessione Janus: " + JSON.stringify(err));
                setStatus('error');
            },
            destroyed: () => setStatus('disconnected')
        });
    }, [attachVideoRoomPlugin]);

    const initializeJanus = useCallback(() => {
        if (isJanusReady) return;

       // Usiamo direttamente l'oggetto importato
        const JanusAPI = Janus;
        
        if (!JanusAPI || typeof JanusAPI !== 'function') {
            console.error("❌ Janus non è disponibile!", JanusAPI);
            setError("Errore: libreria Janus non caricata. Ricarica la pagina.");
            return;
        }

        console.log("✅ Janus trovato:", JanusAPI);

        JanusAPI.init({
            debug: "all",
            dependencies: JanusAPI.useDefaultDependencies({ adapter: adapter }),
            callback: () => {
                if (!JanusAPI.isWebrtcSupported()) {
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