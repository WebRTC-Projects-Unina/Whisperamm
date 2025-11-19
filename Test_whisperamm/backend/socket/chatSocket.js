const {
    getRoom,
    addUserToRoom,
    removeUserFromRoom,
    roomExists,
} = require("../services/rooms");

// Struttura dati: Map<gameId, Map<userId, Set<socket.id>>>
const lobbies = new Map();

// --- FUNZIONI DI SUPPORTO MODULARI ---

function getOrCreateLobbyPresence(gameId) {
    if (!lobbies.has(gameId)) lobbies.set(gameId, new Map());
    return lobbies.get(gameId);
}

function addPresence(gameId, userId, socketId) {
    const lobby = getOrCreateLobbyPresence(gameId);
    if (!lobby.has(userId)) lobby.set(userId, new Set());
    const connections = lobby.get(userId);

    const isFirstConnection = connections.size === 0;
    connections.add(socketId);

    return { lobby, connections, isFirstConnection };
}

function removePresence(gameId, userId, socketId) {
    const lobby = lobbies.get(gameId);
    if (!lobby) return { lobby: null, isLastConnection: false };

    const connections = lobby.get(userId);
    if (!connections) return { lobby, isLastConnection: false };

    connections.delete(socketId);
    const isLastConnection = connections.size === 0;

    if (isLastConnection) {
        lobby.delete(userId);
        if (lobby.size === 0) {
            lobbies.delete(gameId);
        }
    }

    return { lobby, isLastConnection };
}

function canUserJoinRoom(room, userId) {
    const isUserAlreadyIn = room.players.some(p => p.id === userId);
    const isRoomFull = room.players.length >= room.maxPlayers;
    const canJoin = !isRoomFull || isUserAlreadyIn;

    return { isUserAlreadyIn, isRoomFull, canJoin };
}

// --- HANDLER MODULARI ---

function handleJoinLobby(io, socket, { gameId, user }) {
    if (!gameId || !user) return;

    const name = user.username;
    const userId = user.id;

    const room = getRoom(gameId);
    if (!room) {
        socket.emit('lobbyError', { message: 'Stanza non trovata' });
        return;
    }

    const { isUserAlreadyIn, isRoomFull, canJoin } = canUserJoinRoom(room, userId);

    if (!canJoin) {
        socket.emit('lobbyError', { message: 'La stanza è piena.' });
        return;
    }

    if (!isUserAlreadyIn) {
        addUserToRoom(gameId, user);
        console.log(`[Socket] Utente ${name} aggiunto in ${gameId}`);
    } else {
        console.log(`[Socket] Utente ${name} già presente in ${gameId}, non lo ri-aggiungo`);
    }

    // Metadati sul socket
    socket.data.gameId = gameId;
    socket.data.username = name;
    socket.data.userId = userId;

    const { isFirstConnection } = addPresence(gameId, userId, socket.id);
    socket.join(gameId);

    if (isFirstConnection) {
        socket.to(gameId).emit('chatMessage', {
            from: 'system',
            text: `${name} è entrato nella lobby`,
        });
    }

    const players = getRoom(gameId).players;
    io.to(gameId).emit('lobbyPlayers', {
        gameId,
        players: players.map(p => p.username),
    });
}

function handleDisconnect(io, socket) {
    const { gameId, username, userId } = socket.data || {};
    if (!gameId || !username || !userId) return;

    const { isLastConnection } = removePresence(gameId, userId, socket.id);
    if (!isLastConnection) return;

    console.log(`${username} (ID: ${userId}) è offline da ${gameId}`);

    const updatedRoom = removeUserFromRoom(gameId, userId);
    if (!updatedRoom) {
        console.log(`Stanza ${gameId} vuota, eliminata.`);
        return;
    }

    io.to(gameId).emit('chatMessage', {
        from: 'system',
        text: `${username} ha lasciato la lobby`,
    });

    const players = updatedRoom.players;
    io.to(gameId).emit('lobbyPlayers', {
        gameId,
        players: players.map(p => p.username),
    });
}

function handleChatMessage(io, socket, { gameId, text }) {
    const { username } = socket.data || {};
    if (!gameId || !text || !username) return;

    io.to(gameId).emit('chatMessage', {
        from: username,
        text,
        timestamp: Date.now(),
    });
}

// --- REGISTRAZIONE HANDLER PRINCIPALE ---

module.exports = function registerChatHandlers(io) {
    io.on('connection', (socket) => {
        console.log('Nuovo client connesso:', socket.id);

        socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
        socket.on('disconnect', () => handleDisconnect(io, socket));
        socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    });
};