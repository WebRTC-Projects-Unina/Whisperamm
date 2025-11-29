import { useEffect, useRef } from 'react';

export const useLobbySocket = (socket, connectSocket, roomId, user, isAdmin, setIsAdmin, setPlayers, setReadyStates, setIsReady, setAllReady, setCanStartGame, setLobbyError, setAdminPlayer, setMessages, setGameLoading, isValidating, lobbyError) => {
    // Ref per evitare join multipli nello stesso ciclo di vita se le dipendenze cambiano
    const joinedRef = useRef(false); 
    useEffect(() => {
        if(isValidating || lobbyError || !user) return;


        if (!socket) {
            console.log("🔌 Lobby: Socket nullo, richiedo connessione al Provider...");
            connectSocket(); 
            return; 
        }

        const handleLobbyPlayers = (payload) => {
            setPlayers(payload.players || []);
            setReadyStates(payload.readyStates || {});
            console.log("[Socket] Aggiornamento giocatori lobby:", payload.players);
        };

        const handleUserReadyUpdate = (payload) => {
            setReadyStates(payload.readyStates);
            if (payload.username === user.username) {
                setIsReady(payload.readyStates[user.username] || false);
            }
        };

        const handleGameCanStart = () => {
            setAllReady(true);
            if (isAdmin) setCanStartGame(true);
        };

        const handleAllUsersReady = (payload) => {
            console.log("🔔 allUsersReady ricevuto:", payload.allReady, "isAdmin:", isAdmin);
            setAllReady(payload.allReady);
            if (isAdmin) setCanStartGame(payload.allReady);
        };

        const handleChatMessage = (msg) => setMessages((prev) => [...prev, msg]);
        
        const handleLobbySocketError = (error) => {
            setLobbyError(error.message || "Errore socket");
        };
        
        const handleHostChanged = (payload) => {
            setAdminPlayer(payload.newHost);
            if (user.username === payload.newHost) {
                // Aggiorna isAdmin solo per questo user
                setIsAdmin(true);
            }
        };

        const handleGameStarted = (payload) => {
            console.log("🚀 Partita iniziata! Navigazione verso Game...");
            setGameLoading(true);            
        };    

        socket.on('lobbyError', handleLobbySocketError); 
        socket.on('lobbyPlayers', handleLobbyPlayers); 
        socket.on('chatMessage', handleChatMessage); 
        socket.on('hostChanged', handleHostChanged); 
        socket.on('userReadyUpdate', handleUserReadyUpdate); 
        socket.on('gameCanStart', handleGameCanStart); 
        socket.on('allUsersReady', handleAllUsersReady); 
        socket.on('gameStarted', handleGameStarted); 

        // Inizio JOIN robusto
        const performJoin = () => {
            if (joinedRef.current) return; // Esce se già fatto
            
            socket.emit('joinLobby', { roomId, user });
            joinedRef.current = true;
        };

        // Mettiti in ascolto (copre riconnessioni o connessioni lente)
        socket.on('connect', performJoin);

        // Se già connesso esegui subito, altrimenti avvia connessione
        socket.connected ? performJoin() : socket.connect();
        
        return () => {
            if (socket) {
                console.log("🧹 Lobby smontata: Rimozione listener (Socket resta viva)");
                socket.off('lobbyError', handleLobbySocketError);
                socket.off('lobbyPlayers', handleLobbyPlayers);
                socket.off('chatMessage', handleChatMessage);
                socket.off('hostChanged', handleHostChanged);
                socket.off('userReadyUpdate', handleUserReadyUpdate);
                socket.off('gameCanStart', handleGameCanStart);
                socket.off('allUsersReady', handleAllUsersReady);
                socket.off('gameStarted', handleGameStarted);
            }
        };
        
    }, [roomId, user, lobbyError, isValidating, socket, connectSocket, isAdmin]);
};