// chatSocket.js
const { lobbies, disconnectTimeouts, RECONNECT_TOLERANCE_MS, registerUserSocket, unregisterUserSocket } = require('./stateSocket');
const RoomService = require('../services/roomService');
const UserService = require('../services/userService');

// --- HANDLERS ---
async function handleJoinLobby(io, socket, { roomId, user }) {
    // Validazione input base
    console.log(`[Socket] Utente tenta di entrare in lobby ${roomId}`);
    if (!roomId || !user || !user.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti per l\'ingresso.' });
        return;
    }

    const username = user.username;

    // 1. GESTIONE RICONNESSIONE (STOP TIMER)
    if (disconnectTimeouts.has(username)) {
        clearTimeout(disconnectTimeouts.get(username));
        disconnectTimeouts.delete(username);
        console.log(`[Socket] ${username} rientrato in tempo. Timer annullato.`);
    }

    // 2. CONTROLLO ESISTENZA STANZA
    try {
        const room = await RoomService.getRoom(roomId);
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
        const { isNew } = await RoomService.addPlayerToRoom(roomId, username);
        
        if (isNew) {
            console.log(`[Service] Utente ${username} aggiunto alla stanza ${roomId}`);
        } else {
            console.log(`[Service] Utente ${username} già presente in ${roomId} (riconnessione)`);
        }
    } catch (error) {
        socket.emit('lobbyError', { message: error.message });
        return;
    }

    // 4. SETUP SOCKET
    socket.data.roomId = roomId;
    socket.data.username = username;
    socket.join(roomId);

    // 5. GESTIONE CONNESSIONE UNICA (KICK VECCHIA SCHEDA)
    const { oldSocketId } = registerUserSocket(roomId, username, socket.id);

    if (oldSocketId && oldSocketId !== socket.id) {
        console.log(`[Socket] ${username} nuova connessione rilevata. Chiusura vecchio socket: ${oldSocketId}`);
        
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            oldSocket.emit('lobbyError', { 
                message: 'Hai aperto il gioco in un\'altra scheda. Questa connessione è stata chiusa.' 
            });
            oldSocket.disconnect(true);
        }
    }

    // 6. NOTIFICHE AGLI ALTRI
    if (!oldSocketId) {
        socket.to(roomId).emit('chatMessage', {
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });
    }

    // Inviamo la lista aggiornata a tutti
    const updatedPlayers = await RoomService.getPlayers(roomId);
    const readyStates = await RoomService.getReadyStates(roomId);
    io.to(roomId).emit('lobbyPlayers', { 
        players: updatedPlayers,
        readyStates
    });
}

async function notifyHostChange(io, roomId) {
    try {
        const room = await RoomService.getRoom(roomId);
        if (room) {
            io.to(roomId).emit('hostChanged', { 
                newHost: room.host 
            });
        }
    } catch (err) {
        console.error(`[Errore] Impossibile notificare cambio host in ${roomId}:`, err);
    }
}

function handleDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    
    if (!roomId || !username) return;

    const shouldStartTimer = unregisterUserSocket(roomId, username, socket.id);

    if (!shouldStartTimer) {
        console.log(`[Socket] Disconnessione ignorata per ${username} (Socket obsoleto)`);
        return;
    }

    console.log(`[Socket] ${username} offline da ${roomId}. Avvio timer (${RECONNECT_TOLERANCE_MS}ms)...`);

    const timeout = setTimeout(async () => {
        console.log(`[Timer] Timeout scaduto per ${username}. Rimozione definitiva.`);
        
        try {
            await UserService.setUserReady(username, false); 
            const updatedRoom = await RoomService.removePlayerFromRoom(roomId, username);
            const readyStates = await RoomService.getReadyStates(roomId);
            if (!updatedRoom) {
                console.log(`[SERVICE] Stanza ${roomId} eliminata (vuota).`);
                return; 
            }

            // Notifica cambio host se necessario
            await notifyHostChange(io, roomId);

            io.to(roomId).emit('chatMessage', {
                from: 'system',
                text: `${username} ha lasciato la lobby`,
                timestamp: Date.now()
            });

            io.to(roomId).emit('lobbyPlayers', {
                players: updatedRoom.players,
                readyStates
            });
            const { allReady } = await RoomService.checkAllUsersReady(roomId);
            const shouldAllowStart = updatedRoom.players.length > 1 && allReady;

            io.to(roomId).emit('allUsersReady', { shouldAllowStart });

        } catch (err) {
            console.error(`[Errore] Rimozione ${username} da ${roomId}:`, err);
        } finally {
            disconnectTimeouts.delete(username);
        }

    }, RECONNECT_TOLERANCE_MS);

    disconnectTimeouts.set(username, timeout);
}

function handleChatMessage(io, socket, { roomId, text }) {
    const { username } = socket.data;
    
    if (!roomId || !text || !username) return;

    io.to(roomId).emit('chatMessage', {
        from: username,
        text,
        timestamp: Date.now(),
    });
}

// HANDLER: Utente dichiara di essere pronto
async function handleUserReady(io, socket, { roomId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }

    try {
        // Imposta isready a true tramite Service
        await UserService.setUserReady(username, true);

        console.log(`[Service] ${username} è pronto in ${roomId}`);

        // Recupera lo stato di TUTTI
        const readyStates = await RoomService.getReadyStates(roomId);

        // Notifica tutti nella stanza
        io.to(roomId).emit('userReadyUpdate', { 
            username,
            readyStates 
        });

        // Controlla se TUTTI sono pronti
        const { allReady } = await RoomService.checkAllUsersReady(roomId);
        
        io.to(roomId).emit('allUsersReady', { allReady });
        
        if (allReady) {
            io.to(roomId).emit('gameCanStart', { 
                message: 'Tutti i giocatori sono pronti!' 
            });
        }
    } catch (err) {
        console.error(`[Errore] handleUserReady:`, err);
        socket.emit('lobbyError', { message: 'Errore durante l\'aggiornamento dello stato.' });
    }
}

// HANDLER: Reset stato ready -- Non è stata implementata in frontend
async function handleResetReady(io, socket, { roomId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) return;

    try {
        await UserService.setUserReady(username, false);

        console.log(`[Service] ${username} ha resettato lo stato ready`);

        const readyStates = await RoomService.getReadyStates(roomId);
        
        io.to(roomId).emit('userReadyUpdate', { 
            username,
            readyStates 
        });

        // Notifica che NON tutti sono più pronti
        io.to(roomId).emit('allUsersReady', { allReady: false });
        
    } catch (err) {
        console.error(`[Errore] handleResetReady:`, err);
    }
}

async function handleLeaveLobby(io, socket) {
    const { roomId, username } = socket.data;

    if (!roomId || !username) return;

    try {
        // L'utente non è più ready
        await UserService.setUserReady(username, false);

        // Rimuovi il player dalla stanza
        const updatedRoom = await RoomService.removePlayerFromRoom(roomId, username);
        const readyStates = await RoomService.getReadyStates(roomId);

        if (!updatedRoom) {
            console.log(`[SERVICE] Stanza ${roomId} eliminata (vuota) per leaveLobby.`);
            return;
        }

        // Notifica cambio host se necessario
        await notifyHostChange(io, roomId);

        io.to(roomId).emit('chatMessage', {
            from: 'system',
            text: `${username} ha lasciato la lobby`,
            timestamp: Date.now()
        });
        io.to(roomId).emit('lobbyPlayers', {
            players: updatedRoom.players,
            readyStates
        });

        const { allReady } = await RoomService.checkAllUsersReady(roomId);
        io.to(roomId).emit('allUsersReady', { allReady });

    } catch (err) {
        console.error(`[Errore] handleLeaveLobby per ${username} in ${roomId}:`, err);
    } finally {
        // Esci dal roomId di socket.io
        socket.leave(roomId);
        socket.data.roomId = null;
    }
}

// --- EXPORT E REGISTRAZIONE ---
function attach(socket, io) {
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    socket.on('leaveLobby', () => handleLeaveLobby(io, socket));
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };