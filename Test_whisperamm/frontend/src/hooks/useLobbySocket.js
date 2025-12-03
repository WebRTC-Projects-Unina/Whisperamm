import { useEffect, useRef } from 'react';

export const useLobbySocket = (socket, connectSocket, roomId, user, isAdmin, setIsAdmin, setPlayers, setReadyStates, setIsReady, setAllReady, setCanStartGame, setLobbyError, setAdminPlayer, setMessages, setGameLoading, isValidating, lobbyError, allReady) => {
    // NOTA: Ho aggiunto 'allReady' tra i parametri in ingresso per usarlo nelle dipendenze dell'effetto di logica
    
    const joinedRef = useRef(false);

    // --- EFFETTO 1: LOGICA DI STATO DERIVATO (Sincrono) ---
    // Questo risolve il problema del "HostChanged". Ogni volta che cambia isAdmin o allReady, ricalcoliamo.
    useEffect(() => {
        if (isAdmin && allReady) {
            setCanStartGame(true);
        } else {
            setCanStartGame(false);
        }
    }, [isAdmin, allReady, setCanStartGame]);


    // --- EFFETTO 2: GESTIONE SOCKET (Asincrono) ---
    useEffect(() => {
        if (isValidating || lobbyError || !user) return;

        if (!socket) {
            connectSocket();
            return;
        }

        // START HANDLERS
        // Nota: Rimuoviamo la logica condizionale complessa da qui dentro.
        // I listener devono solo "settare i dati grezzi".
        
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

        // Unifichiamo la logica: il server ci dice solo se tutti sono pronti.
        // La UI si aggiorna9B0805 grazie all'useEffect 1 qui sopra.
        const handleAllUsersReady = (payload) => {
            console.log("🔔 [Socket] Stato AllReady:", payload.allReady);
            setAllReady(payload.allReady); 
        };

        const handleChatMessage = (msg) => setMessages((prev) => [...prev, msg]);
        
        const handleLobbySocketError = (error) => {
            setLobbyError(error.message || "Errore socket");
        };
        
        const handleHostChanged = (payload) => {
            console.log(`👑 Nuovo Host: ${payload.newHost}`);
            setAdminPlayer(payload.newHost);
            // Qui controlliamo solo se siamo noi il nuovo host
            if (user.username === payload.newHost) {
                setIsAdmin(true);
            } else {
                setIsAdmin(false);
            }
        };

        const handleGameStarted = () => {
            console.log("🚀 Partita iniziata!");
            setGameLoading(true);            
        };    

        // EVENT LISTENER
        socket.on('lobbyError', handleLobbySocketError); 
        socket.on('lobbyPlayers', handleLobbyPlayers); 
        socket.on('chatMessage', handleChatMessage); 
        socket.on('hostChanged', handleHostChanged); 
        socket.on('userReadyUpdate', handleUserReadyUpdate); 
        socket.on('allUsersReady', handleAllUsersReady); 
        socket.on('gameStarted', handleGameStarted); 

        // Rimosso 'gameCanStart' perché ridondante con 'allUsersReady' + logica lato client

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
                console.log("🧹 Cleanup Socket Listeners");
                socket.off('lobbyError', handleLobbySocketError);
                socket.off('lobbyPlayers', handleLobbyPlayers);
                socket.off('chatMessage', handleChatMessage);
                socket.off('hostChanged', handleHostChanged);
                socket.off('userReadyUpdate', handleUserReadyUpdate);
                socket.off('allUsersReady', handleAllUsersReady);
                socket.off('gameStarted', handleGameStarted);
                socket.disconnect(); // Lascia gestire la disconnessione al livello superiore o all'unmount della pagina
            }
        };
        
    }, [roomId, user, lobbyError, isValidating, connectSocket]); 
    
};