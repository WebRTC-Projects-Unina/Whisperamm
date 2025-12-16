import { useEffect, useRef } from 'react';

export const useLobbySocket = (
    socket, 
    connectSocket, 
    roomId, 
    user, 
    setPlayers, 
    setReadyStates, 
    setAllReady, 
    setAdminPlayer, 
    setIsReady, 
    setMessages, 
    setGameLoading, 
    setLobbyError, 
    isValidating, 
    lobbyError
) => {
    
    const joinedRef = useRef(false);

    useEffect(() => {
        // Non connetterti se stiamo ancora validando o c'è errore
        if (isValidating || lobbyError || !user) return;

        if (!socket) {
            connectSocket();
            return;
        }

        // --- A. GESTORE STATO COMPLETO (Join, Leave, HostChange) ---
        // Riceve tutto: players, readyStates, host, allReady
        const handleLobbyState = (payload) => {
            
            setPlayers(payload.players || []);
            setReadyStates(payload.readyStates || {});
            setAllReady(payload.allReady);
            setAdminPlayer(payload.host);

            // Sincronizza il mio stato locale 'isReady' con quello del server
            if (payload.readyStates && user.username) {
                setIsReady(payload.readyStates[user.username] || false);
            }
        };

        // --- B. GESTORE AGGIORNAMENTO PARZIALE (User Ready/Unready) ---
        // Riceve solo: username, isReady, allReady. Leggerissimo.
        const handlePlayerReadyChange = ({ username, isReady, allReady }) => {
            console.log(`⚡ Update: ${username} è ${isReady ? 'Pronto' : 'Non pronto'}`);

            // 1. Aggiorna solo la voce specifica nella mappa
            setReadyStates(prev => ({
                ...prev,
                [username]: isReady
            }));

            // 2. Aggiorna il flag globale (calcolato dal server)
            setAllReady(allReady);

            // 3. Se l'aggiornamento riguarda ME, aggiorno il mio stato locale UI
            if (username === user.username) {
                setIsReady(isReady);
            }
        };

        const handleChatMessage = (msg) => setMessages((prev) => [...prev, msg]);
        
        const handleGameLoading = () => {
            console.log("handlegameloading")
            setGameLoading(true);            
        };   

        const handleLobbySocketError = (error) => {
            setLobbyError(error.message || "Errore socket");
        };

        // SETUP LISTENERS
        socket.on('lobbyState', handleLobbyState);          // <--- Evento Pesante
        socket.on('playerReadyChange', handlePlayerReadyChange); // <--- Evento Leggero
        socket.on('chatMessage', handleChatMessage); 
        socket.on('gameLoading', handleGameLoading); 
        socket.on('lobbyError', handleLobbySocketError); 

        // JOIN LOGIC
        const performJoin = () => {
            if (joinedRef.current) return;
            socket.emit('joinLobby', { roomId, user });
            joinedRef.current = true;
        };

        socket.on('connect', performJoin);
        socket.connected ? performJoin() : socket.connect();
        
        return () => {
            if (socket) {
                console.log("Cleanup Socket Listeners");
                socket.off('lobbyState', handleLobbyState);
                socket.off('playerReadyChange', handlePlayerReadyChange);
                socket.off('chatMessage', handleChatMessage);
                socket.off('gameLoading', handleGameLoading);
                socket.off('lobbyError', handleLobbySocketError);
                socket.disconnect();
            }
        };
        
    }, [roomId, user, lobbyError, isValidating, connectSocket]); 
};