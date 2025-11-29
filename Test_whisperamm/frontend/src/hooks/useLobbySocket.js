import { useEffect } from 'react';

export const useLobbySocket = (socket, connectSocket, roomId, user, isAdmin, setIsAdmin, setPlayers, setReadyStates, setIsReady, setAllReady, setCanStartGame, setLobbyError, setAdminPlayer, setMessages, setGameLoading, isValidating, lobbyError) => {
    
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
                setIsAdmin(true);
            }
        };

        const handleGameStarted = (payload) => {
            console.log("🚀 Partita iniziata! Navigazione verso Game...");
            setGameLoading(true);            
        };    

        console.log("Socket pronta, invio joinLobby...");
        socket.emit('joinLobby', { roomId, user });

        socket.on('lobbyError', handleLobbySocketError); 
        socket.on('lobbyPlayers', handleLobbyPlayers); 
        socket.on('chatMessage', handleChatMessage); 
        socket.on('hostChanged', handleHostChanged); 
        socket.on('userReadyUpdate', handleUserReadyUpdate); 
        socket.on('gameCanStart', handleGameCanStart); 
        socket.on('allUsersReady', handleAllUsersReady); 
        socket.on('gameStarted', handleGameStarted); 

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