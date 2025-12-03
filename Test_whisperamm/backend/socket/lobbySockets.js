const RoomService = require('../services/roomService');
const UserService = require('../services/userService');
const SocketService = require('../services/socketService');
const NotificationService = require('../services/notificationService');


// --- HELPER: BROADCAST STATO COMPLETO ---
async function broadcastFullState(io, roomId) {
    try {
        // Eseguiamo le chiamate in parallelo.
        // NOTA: Usiamo RoomService.getHost(roomId) che ora è ottimizzato (HGET)
        const [players, readyStates, checkReady, host] = await Promise.all([
            RoomService.getPlayers(roomId),
            RoomService.getReadyStates(roomId),
            RoomService.checkAllUsersReady(roomId),
            RoomService.getHost(roomId) 
        ]);

        // Se host è null, la stanza probabilmente non esiste più
        if (!host) return;

        NotificationService.broadcastToRoom(io, roomId, 'lobbyState', {
            players,
            readyStates,
            allReady: checkReady.allReady,
            host 
        });

    } catch (error) {
        console.error(`[BroadcastFullError] Room ${roomId}:`, error);
    }
}

// --- HANDLERS ---
async function handleJoinLobby(io, socket, { roomId, user }) {
    if (!roomId || !user?.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }
    const username = user.username;

    try {
        socket.data.roomId = roomId;
        socket.data.username = username;
        socket.join(roomId);
        
        await SocketService.registerConnection(roomId, username, socket.id); 

        // Notifica chat
        NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });

        // Broadcast stato completo
        await broadcastFullState(io, roomId);

        console.log(`[Socket] ${username} entrato in ${roomId}`);

    } catch (error) {
        socket.emit('lobbyError', { message: error.message });
        socket.disconnect(); 
    }
}

async function handleDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    if (!roomId || !username) return;

    try {
        const isCurrentSocket = await SocketService.unregisterConnection(roomId, username, socket.id);
        if (!isCurrentSocket) return; 
        
        const { deletedRoom } = await RoomService.removePlayerFromRoom(roomId, username);

        if (deletedRoom) {
            console.log(`[Socket] Stanza ${roomId} eliminata (vuota).`);
            return; 
        }

        NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
            from: 'system', 
            text: `${username} ha lasciato la lobby`,
            timestamp: Date.now()
        });

        // Broadcast stato completo (gestisce rimozioni e cambio host)
        await broadcastFullState(io, roomId);

        console.log(`[Socket] ${username} offline da ${roomId}.`);

    } catch (err) {
        console.error(`[Errore Disconnect] ${username}:`, err);
    }
}

async function handleUserReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;

    try {
        await UserService.setUserReady(username, true);
        const { allReady } = await RoomService.checkAllUsersReady(roomId);
        
        // Broadcast leggero per il Pronto, non avrebbe senso mandargli anche l'host di nuovo..
        NotificationService.broadcastToRoom(io, roomId, 'playerReadyChange', { 
            username,
            isReady: true,
            allReady 
        });

    } catch (err) {
        console.error(`[Errore Ready] ${username}`, err);
    }
}

async function handleResetReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;

    try {
        await UserService.setUserReady(username, false);
        
        // Broadcast leggero (Delta Update)
        NotificationService.broadcastToRoom(io, roomId, 'playerReadyChange', { 
            username,
            isReady: false,
            allReady: false 
        });
        
    } catch (err) {
        console.error(`[Errore Reset]`, err);
    }
}

async function handleChatMessage(io, socket, { roomId, text }) {
    const { username } = socket.data;
    if (!roomId || !text) return;

    NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
        from: username,
        text,
        timestamp: Date.now(),
    });
}

function attach(socket, io) {
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };