import React, { createContext, useState, useCallback, useRef } from 'react';
import Janus from '../utils/janus';
import { useAuth } from './AuthProvider';

export const JanusContext = createContext();

export const JanusProvider = ({ children }) => {
    const { user } = useAuth();
    
    const [janusSession, setJanusSession] = useState(null);
    const [janusHandles, setJanusHandles] = useState(new Map());
    const [isJanusReady, setIsJanusReady] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const janusInstanceRef = useRef(null);
    const initPromiseRef = useRef(null);

    /**
     * 1️⃣ NUOVO: Richiedi permessi mic e camera
     */
    const requestMediaPermissions = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            setLocalStream(stream);
            console.log('✅ Permessi mic/camera autorizzati');
            return true;
        } catch (err) {
            const errorMsg = err.name === 'NotAllowedError' 
                ? 'Permessi negati per mic/camera' 
                : err.message;
            setError(errorMsg);
            console.error('❌ Errore permessi:', err);
            return false;
        }
    }, []);

    /**
     * Inizializza la libreria Janus + chiede permessi
     * LAZY: si chiama solo quando serve (in Lobby)
     */
    const initializeJanus = useCallback(async () => {
        // Se già in inizializzazione, attendi
        if (initPromiseRef.current) {
            return initPromiseRef.current;
        }

        // Se già inizializzato, return subito
        if (isJanusReady) {
            return Promise.resolve();
        }

        setIsInitializing(true);

        initPromiseRef.current = new Promise(async (resolve, reject) => {
            try {
                // 1️⃣ Prima: richiedi permessi
                const permissionsGranted = await requestMediaPermissions();
                if (!permissionsGranted) {
                    reject(new Error('Permessi mic/camera negati'));
                    return;
                }

                // 2️⃣ Poi: inizializza Janus
                Janus.init({
                    debug: true,
                    callback: () => {
                        setIsJanusReady(true);
                        setIsInitializing(false);
                        initPromiseRef.current = null;
                        resolve();
                    },
                    error: (error) => {
                        console.error('Janus initialization error:', error);
                        setError(error);
                        setIsInitializing(false);
                        initPromiseRef.current = null;
                        reject(error);
                    },
                });
            } catch (error) {
                console.error('Error during initialization:', error);
                setError(error.message);
                setIsInitializing(false);
                initPromiseRef.current = null;
                reject(error);
            }
        });

        return initPromiseRef.current;
    }, [isJanusReady, requestMediaPermissions]);

    /**
     * Cleanup: ferma lo stream
     */
    const cleanup = useCallback(() => {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        setIsJanusReady(false);
    }, [localStream]);

    /**
     * Crea una nuova sessione Janus sul backend
     */
    const createJanusSession = useCallback(async () => {
        try {
            const response = await fetch('/api/janus/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    userId: user?.username
                }),
            });

            const data = await response.json();

            if (data.success) {
                setJanusSession(data.sessionId);
                return data.sessionId;
            } else {
                throw new Error(data.error || 'Failed to create Janus session');
            }
        } catch (err) {
            console.error('Error creating Janus session:', err);
            setError(err.message);
            throw err;
        }
    }, [user]);

    /**
     * Attacca un handle al VideoRoom
     */
    const attachVideoRoom = useCallback(async (roomId) => {
        try {
            const response = await fetch('/api/janus/attach-videoroom', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    roomId,
                    userId: user?.username
                }),
            });

            const data = await response.json();

            if (data.success) {
                const newHandles = new Map(janusHandles);
                newHandles.set(roomId, data.handleId);
                setJanusHandles(newHandles);
                return data.handleId;
            } else {
                throw new Error(data.error || 'Failed to attach VideoRoom');
            }
        } catch (err) {
            console.error('Error attaching VideoRoom:', err);
            setError(err.message);
            throw err;
        }
    }, [janusHandles, user]);

    /**
     * Invia un messaggio al plugin Janus
     */
    const sendJanusMessage = useCallback(async (body, jsep = null) => {
        try {
            const response = await fetch('/api/janus/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    body, 
                    jsep,
                    userId: user?.username
                }),
            });

            const data = await response.json();

            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.error || 'Failed to send message');
            }
        } catch (err) {
            console.error('Error sending Janus message:', err);
            setError(err.message);
            throw err;
        }
    }, [user]);

    /**
     * Distrugge la sessione Janus
     */
    const destroyJanusSession = useCallback(async () => {
        try {
            cleanup();

            const response = await fetch('/api/janus/destroy-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    userId: user?.username
                }),
            });

            const data = await response.json();

            if (data.success) {
                setJanusSession(null);
                setJanusHandles(new Map());
                return true;
            } else {
                throw new Error(data.error || 'Failed to destroy session');
            }
        } catch (err) {
            console.error('Error destroying Janus session:', err);
            setError(err.message);
            throw err;
        }
    }, [user, cleanup]);

    const value = {
        janusSession,
        janusHandles,
        isJanusReady,
        isInitializing,
        error,
        localStream,
        initializeJanus,
        createJanusSession,
        attachVideoRoom,
        sendJanusMessage,
        destroyJanusSession,
        cleanup,
    };

    return (
        <JanusContext.Provider value={value}>{children}</JanusContext.Provider>
    );
};