import { useEffect, useRef, useState } from 'react';
import Janus from '../utils/janus';

export const useJanusAudio = (socket, roomId, username) => {
    const [audioInitialized, setAudioInitialized] = useState(false);
    const [audioError, setAudioError] = useState(null);
    const janusRef = useRef(null);
    const sessionRef = useRef(null);
    const handleRef = useRef(null);
    const pcRef = useRef(null);

    useEffect(() => {
        if (!socket || !roomId || !username) return;

        // Inizializza Janus libreria
        Janus.init({
            debug: false,
            callback: () => {
                console.log('[Janus] Library initialized');
                // Richiedi al server di inizializzare una sessione Janus
                socket.emit('initAudio', { roomId, username });
            }
        });

        // Listener per la risposta dal server
        const handleAudioInitialized = async (data) => {
            try {
                console.log('[Janus] Received credentials:', data);
                const { janusUrl, janusSessionId, janusHandleId } = data;

                // Crea una nuova sessione Janus client-side
                janusRef.current = new Janus({
                    server: janusUrl,
                    success: async () => {
                        console.log('[Janus] Connected to gateway');
                        sessionRef.current = janusSessionId;
                        handleRef.current = janusHandleId;

                        // Genera un offer SDP
                        await generateAndSendOffer();
                    },
                    error: (error) => {
                        console.error('[Janus] Connection error:', error);
                        setAudioError(error);
                    }
                });
            } catch (err) {
                console.error('[Janus] Error initializing:', err);
                setAudioError(err.message);
            }
        };

        const handleAudioAnswer = async (data) => {
            try {
                console.log('[Janus] Received answer');
                const { jsep } = data;
                
                if (pcRef.current && jsep) {
                    await pcRef.current.setRemoteDescription(
                        new RTCSessionDescription(jsep)
                    );
                    setAudioInitialized(true);
                }
            } catch (err) {
                console.error('[Janus] Error handling answer:', err);
                setAudioError(err.message);
            }
        };

        const handleAudioError = (data) => {
            console.error('[Janus] Audio error:', data.message);
            setAudioError(data.message);
        };

        socket.on('audioInitialized', handleAudioInitialized);
        socket.on('audioAnswer', handleAudioAnswer);
        socket.on('audioError', handleAudioError);

        return () => {
            socket.off('audioInitialized', handleAudioInitialized);
            socket.off('audioAnswer', handleAudioAnswer);
            socket.off('audioError', handleAudioError);

            // Cleanup
            if (socket) {
                socket.emit('leaveAudio', { roomId, username });
            }
            if (pcRef.current) {
                pcRef.current.close();
            }
        };
    }, [socket, roomId, username]);

    const generateAndSendOffer = async () => {
        try {
            // Crea un PeerConnection
            pcRef.current = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            // Richiedi accesso al microfono
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getAudioTracks().forEach(track => {
                pcRef.current.addTrack(track, stream);
            });

            // Genera l'offer
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);

            // Invia l'offer al server
            socket.emit('audioOffer', {
                roomId,
                username,
                sdpOffer: offer.sdp
            });

            console.log('[Janus] Offer sent');
        } catch (err) {
            console.error('[Janus] Error generating offer:', err);
            setAudioError(err.message);
        }
    };

    return { audioInitialized, audioError };
};