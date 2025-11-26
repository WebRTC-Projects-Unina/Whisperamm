const { lobbies, disconnectTimeouts, RECONNECT_TOLERANCE_MS, registerUserSocket, unregisterUserSocket } = require('./stateSocket');
const RoomService = require('../services/roomService');
const UserService = require('../services/userService');

// --- HANDLERS ---
async function handleJoinLobby(io, socket, { roomId, user }) {
    // Validazione input base
    if (!roomId || !user || !user.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti per l\'ingresso.' });
        return;
    }

    const username = user.username;

    // 1. GESTIONE RICONNESSIONE (STOP TIMER)
    // Se l'utente sta rientrando mentre correva il timer di disconnessione, lo fermiamo.
    if (disconnectTimeouts.has(username)) {
        clearTimeout(disconnectTimeouts.get(username));
        disconnectTimeouts.delete(username);
        console.log(`[Socket] ${username} rientrato in tempo. Timer annullato.`);
    }

    // 2. CONTROLLO ESISTENZA STANZA
    try {
        const room = await RoomService.getRoom(gameId);
        if (!room) {
            socket.emit('lobbyError', { message: 'Stanza non trovata' });
            return;
        }
    } catch (err) {
        socket.emit('lobbyError', { message: 'Stanza non trovata' });
        return;
    }

    // 3. LOGICA DI ACCESSO
    try {
        const { isNew } = await RoomService.addPlayerToRoom(gameId, username);
        
        if (isNew) {
            console.log(`[Service] Utente ${username} aggiunto alla stanza ${gameId}`);
        } else {
            console.log(`[Service] Utente ${username} già presente in ${gameId} (riconnessione)`);
        }
    } catch (error) {
        // Gestione errori (es. Stanza piena, Partita iniziata)
        socket.emit('lobbyError', { message: error.message });
        return;
    }

    // 4. SETUP SOCKET
    socket.data.roomId = roomId;
    socket.data.username = username;
    socket.join(gameId);

    // 5. GESTIONE CONNESSIONE UNICA (KICK VECCHIA SCHEDA)
    const { oldSocketId } = registerUserSocket(roomId, username, socket.id);

    // Se c'era un altro socket aperto per questo utente (diverso da questo), lo chiudiamo.
    if (oldSocketId && oldSocketId !== socket.id) {
        console.log(`[Socket] ${username} nuova connessione rilevata. Chiusura vecchio socket: ${oldSocketId}`);
        
        // Recuperiamo l'oggetto socket vecchio
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            oldSocket.emit('lobbyError', { message: 'Hai aperto il gioco in un\'altra scheda. Questa connessione è stata chiusa.' });
            oldSocket.disconnect(true); // Disconnessione forzata
        }
    }

    // 6. NOTIFICHE AGLI ALTRI
    // Notifichiamo l'ingresso in chat solo se non era un semplice reload (cioè se non aveva socket attivi prima)
    if (!oldSocketId) {
        socket.to(roomId).emit('chatMessage', {
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });
    }

    // Inviamo la lista aggiornata a tutti
    const updatedPlayers = await RoomService.getPlayers(gameId);
    io.to(gameId).emit('lobbyPlayers', { 
        players: updatedPlayers 
    });
}

async function notifyHostChange(io, gameId) {
    try {
        const room = await RoomService.getRoom(gameId);
        if (room) {
            io.to(gameId).emit('hostChanged', { 
                newHost: room.host 
            });
        }
    } catch (err) {
        console.error(`[Errore] Impossibile notificare cambio host in ${gameId}:`, err);
    }
}

function handleDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    
    if (!gameId || !username) return;

    const shouldStartTimer = unregisterUserSocket(gameId, username, socket.id);

    if (!shouldStartTimer) {
        console.log(`[Socket] Disconnessione ignorata per ${username} (Socket obsoleto o sostituito).`);
        return;
    }

    console.log(`[Socket] ${username} offline da ${gameId}. Avvio timer (${RECONNECT_TOLERANCE_MS}ms)...`);

    // 2. AVVIO TIMER (REDIS)
    const timeout = setTimeout(async () => {
        console.log(`[Timer] Timeout scaduto per ${username}. Rimozione definitiva da Redis.`);
        
        try {
            const updatedRoom = await RoomService.removePlayerFromRoom(gameId, username);

            // Se updatedRoom è null, la stanza è stata cancellata (era vuota)
            if (!updatedRoom) {
                console.log(`[SERVICE] Stanza ${gameId} eliminata (vuota).`);
                return; 
            }

            // Notifica cambio host se necessario
            await notifyHostChange(io, gameId);

            io.to(gameId).emit('chatMessage', {
                from: 'system',
                text: `${username} ha lasciato la lobby`,
                timestamp: Date.now()
            });

            io.to(roomId).emit('lobbyPlayers', {
                players: updatedRoom.players
            });

        } catch (err) {
            console.error(`[Errore] Rimozione ${username} da ${gameId}:`, err);
        } finally {
            disconnectTimeouts.delete(username);
        }

    }, RECONNECT_TOLERANCE_MS);

    // Salviamo il timer per poterlo cancellare se l'utente torna
    disconnectTimeouts.set(username, timeout);
}

function handleChatMessage(io, socket, { text }) {
    const {username, roomId} = socket.data;
    
    if (!gameId || !text || !username) return;

    io.to(roomId).emit('chatMessage', {
        from: username,
        text,
        timestamp: Date.now(),
    });
}

// HANDLER: Utente dichiara di essere pronto
async function handleUserReady(io, socket, { gameId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }

    const client = getRedisClient();

    // Imposta isready a true
    await client.hSet(`user:${username}`, 'isready', 'true');

        console.log(`[Service] ${username} è pronto in ${gameId}`);

        // Recupera lo stato di TUTTI
        const readyStates = await RoomService.getReadyStates(gameId);

        // Notifica tutti nella stanza
        io.to(gameId).emit('userReadyUpdate', { 
            username,
            readyStates 
        });

        // Controlla se TUTTI sono pronti
        const { allReady } = await RoomService.checkAllUsersReady(gameId);
        
        io.to(gameId).emit('allUsersReady', { allReady });
        
        if (allReady) {
            io.to(gameId).emit('gameCanStart', { 
                message: 'Tutti i giocatori sono pronti!' 
            });
        }
    } catch (err) {
        console.error(`[Errore] handleUserReady:`, err);
        socket.emit('lobbyError', { message: 'Errore durante l\'aggiornamento dello stato.' });
    }
}

// HANDLER: Reset stato ready -- Non è stata implementata in frontend
async function handleResetReady(io, socket, { gameId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) return;

    const client = getRedisClient();
    await client.hSet(`user:${username}`, 'isready', 'false');

        console.log(`[Service] ${username} ha resettato lo stato ready`);

        const readyStates = await RoomService.getReadyStates(gameId);
        
        io.to(gameId).emit('userReadyUpdate', { 
            username,
            readyStates 
        });

        // Notifica che NON tutti sono più pronti
        io.to(gameId).emit('allUsersReady', { allReady: false });
        
    } catch (err) {
        console.error(`[Errore] handleResetReady:`, err);
    }
}

// HANDLER: Admin avvia la partita
async function handleGameStarted(io, socket, { gameId }) {
    const { username } = socket.data;

    try {
        const isHost = await RoomService.isUserHost(gameId, username);
        
        if (!isHost) {
            socket.emit('lobbyError', { 
                message: 'Solo l\'admin può avviare la partita.' 
            });
            return;
        }

        console.log(`[Service] Admin ${username} ha avviato la partita in ${gameId}`);

        // Notifica TUTTI nella stanza
        io.to(gameId).emit('gameStarted', { gameId });
        
    } catch (err) {
        console.error(`[Errore] handleGameStarted:`, err);
        socket.emit('lobbyError', { 
            message: err.message === 'ROOM_NOT_FOUND' 
                ? 'Stanza non trovata' 
                : 'Errore durante l\'avvio della partita' 
        });
    }
}

// --- EXPORT E REGISTRAZIONE ---

function attach(socket, io) {
    // 1. Ingresso in Lobby
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    // 2. Messaggi Chat
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    // 3. Utente pronto
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    // 4. Reset stato ready
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    // 5. Admin avvia la partita
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
    // 6. Disconnessione (Nativa di Socket.IO)
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };
