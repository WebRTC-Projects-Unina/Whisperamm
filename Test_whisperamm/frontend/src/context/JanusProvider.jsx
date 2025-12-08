import React, { createContext, useState, useCallback, useRef, useEffect } from 'react';
// 1. IMPORT FONDAMENTALI: Adapter deve essere il primo
import 'webrtc-adapter';
import Janus from 'janus-gateway'; 
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
    
    // --- FIX 1: NON usare Janus.randomString qui. Usa JS nativo per evitare crash se Janus è undefined ---
    const opaqueId = useRef(`videoroom-${Math.random().toString(36).substring(2, 14)}`);
    
    const currentRoomIdRef = useRef(null);
    const remoteFeedsRef = useRef({});
    const publisherIdRef = useRef(null);

    const JANUS_SERVER = 'http://130.110.9.51:8088/janus'; 

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
            
                // Force local stream check
                setTimeout(() => {
                    const handle = videoroomHandleRef.current;
                    if (handle && handle.webrtcStuff && handle.webrtcStuff.myStream) {
                        console.log("🔥🔥🔥 FORCE: Stream Locale trovato manualmente!");
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

    const subscribeToRemoteFeed = useCallback((id, display, room) => {
        if (remoteFeedsRef.current[id]) return;

        // --- FIX 2: Usa window.Janus se Janus è undefined ---
        const JanusLib = Janus || window.Janus;
        if (!JanusLib) return;

        JanusLib.attach({
            plugin: "janus.plugin.videoroom",
            opaqueId: opaqueId.current,
            success: (pluginHandle) => {
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
                            remoteFeedsRef.current[id].send({ 
                                message: { request: "start", room: room }, 
                                jsep: jsep 
                            });
                            setTimeout(() => {
                                forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                            }, 1500);
                        },
                        error: (err) => console.error("❌ WebRTC error:", err)
                    });
                }
                if (msg["started"] === "ok" || (msg["videoroom"] === "event" && msg["started"] === "ok")) {
                      setTimeout(() => {
                          forceStreamUpdate(remoteFeedsRef.current[id], id, display, setRemoteStreams);
                      }, 500);
                }
            },
            ontrack: (track, mid, on) => {
                const stream = track.streams ? track.streams[0] : new MediaStream([track]);
                gestisciStream(stream, id, display, setRemoteStreams);
            },
            onremotestream: (stream) => {
                gestisciStream(stream, id, display, setRemoteStreams);
            },
            oncleanup: () => {
                setRemoteStreams(prev => prev.filter(p => p.id !== id));
                delete remoteFeedsRef.current[id];
            }
        });
    }, []);

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
                    for (let f of list) {
                        subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    }
                }
            } 
            else if (event === "event") {
                if (msg["publishers"]) {
                    const list = msg["publishers"];
                    for (let f of list) {
                        subscribeToRemoteFeed(f["id"], f["display"], msg["room"]);
                    }
                } 
                else if (msg["leaving"] || msg["unpublished"]) {
                    const leavingId = msg["leaving"] || msg["unpublished"];
                    if (leavingId !== 'ok') {
                        setRemoteStreams(prev => prev.filter(p => p.id !== leavingId));
                        if (remoteFeedsRef.current[leavingId]) {
                            remoteFeedsRef.current[leavingId].detach();
                            delete remoteFeedsRef.current[leavingId];
                        }
                    }
                } 
                else if (msg["error"]) {
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
                if (stream) setLocalStream(stream);
            },
            oncleanup: () => {
                setLocalStream(null);
            }
        });
    }, [onJanusMessage]);

    const createJanusSession = useCallback(() => {
        setStatus('connecting');
        
        // --- FIX 3: Recupero sicuro di Janus ---
        const JanusLib = Janus || window.Janus;

        const janus = new JanusLib({
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
    }, [attachVideoRoomPlugin, JANUS_SERVER]);

    const initializeJanus = useCallback(() => {
        if (isJanusReady) return;

        // --- FIX 4: Il punto del CRASH originale ---
        // Cerchiamo Janus dall'import o dalla window
        const JanusLib = Janus || window.Janus;

        if (!JanusLib) {
            console.error("❌ ERRORE CRITICO: Janus non caricato!");
            setError("Libreria Janus non disponibile");
            return;
        }

        if (!JanusLib.init) {
             console.error("❌ Janus caricato ma metodo .init mancante", JanusLib);
             return;
        }

        JanusLib.init({
            debug: "all",
            callback: () => {
                if (!JanusLib.isWebrtcSupported()) {
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