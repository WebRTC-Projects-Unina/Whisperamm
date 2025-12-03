const RoomService = require('../services/roomService');
const UserService = require('../services/userService');
const SocketService = require('../services/socketService');
const NotificationService = require('../services/notificationService');

// --- HELPER PER NOTIFICARE LO STATO DELLA STANZA ---
// Questo evita di copiare-incollare 4 volte la stessa logica
async function broadcastRoomState(io, roomId) {
    // 1. Invia lista giocatori e stati ready
    const updatedPlayers = await RoomService.getPlayers(roomId);
    const readyStates = await RoomService.getReadyStates(roomId);
    
    NotificationService.broadcastToRoom(io, roomId, 'lobbyPlayers', { 
        players: updatedPlayers,
        readyStates
    });

    // 2. Controlla AllReady
    const { allReady } = await RoomService.checkAllUsersReady(roomId);
    
    // Invia lo stato globale di "prontezza"
    io.to(roomId).emit('allUsersReady', { allReady });
}

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

        // Messaggio di benvenuto
        NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });

        // Aggiorna tutti
        await broadcastRoomState(io, roomId);

        console.log(`[ChatSocket] ${username} entrato in ${roomId}`);

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
        if (!isCurrentSocket) return; // Era una vecchia connessione fantasma
        
        // Rimuove player e gestisce logica Host
        const { updatedRoom, hostChanged, deletedRoom } = await RoomService.removePlayerFromRoom(roomId, username);

        if (deletedRoom) {
            console.log(`[RoomSocket] Stanza ${roomId} eliminata.`);
            return; 
        }

        // Notifica uscita
        NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
            from: 'system', 
            text: `${username} ha lasciato la lobby`,
            timestamp: Date.now()
        });

        // IMPORTANTE: Gestire cambio host PRIMA di inviare lo stato "ready"
        if (hostChanged) {
            console.log(`[RoomSocket] Cambio host in ${roomId}: ${updatedRoom.host}`);
            NotificationService.broadcastToRoom(io, roomId, 'hostChanged', { newHost: updatedRoom.host });
        }

        // Aggiorna lista giocatori e ricalcola se "Tutti sono pronti"
        // Se l'utente che è uscito era l'unico non pronto, ora allReady potrebbe diventare true!
        await broadcastRoomState(io, roomId);

        console.log(`[RoomSocket] ${username} offline da ${roomId}.`);

    } catch (err) {
        console.error(`[Errore] Disconnessione ${username}:`, err);
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

async function handleUserReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;

    try {
        await UserService.setUserReady(username, true);
        
        // Notifica specifica user update (opzionale se usiamo broadcastRoomState, ma più reattivo per UI parziale)
        const readyStates = await RoomService.getReadyStates(roomId);
        NotificationService.broadcastToRoom(io, roomId, 'userReadyUpdate', { 
            username,
            readyStates 
        });

        // Controlla globale e aggiorna tasto Start
        const { allReady } = await RoomService.checkAllUsersReady(roomId);
        io.to(roomId).emit('allUsersReady', { allReady });
        
        // NOTA: Rimosso 'gameCanStart'. Il frontend sa che se allReady è true e l'user è admin, il tasto si accende.

    } catch (err) {
        console.error(`[Errore Ready] ${username}`, err);
    }
}

async function handleResetReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;

    try {
        await UserService.setUserReady(username, false);
        
        // Aggiorna UI
        const readyStates = await RoomService.getReadyStates(roomId);
        io.to(roomId).emit('userReadyUpdate', { username, readyStates });
        
        // Sicuramente non sono più tutti pronti
        io.to(roomId).emit('allUsersReady', { allReady: false });
        
    } catch (err) {
        console.error(`[Errore Reset]`, err);
    }
}

// --- SICUREZZA: START GAME ---
// Aggiungi questo handler! Non fidarti mai del frontend.
async function handleStartGame(io, socket, { roomId }) {
    const { username } = socket.data;
    
    // 1. Verifica che sia l'Host
    const isHost = await RoomService.isHost(roomId, username); 
    if (!isHost) {
        console.warn(`[Security] ${username} ha provato a startare senza essere host.`);
        return;
    }

    // 2. Verifica che tutti siano pronti (Double Check)
    const { allReady } = await RoomService.checkAllUsersReady(roomId);
    if (!allReady) {
        socket.emit('lobbyError', { message: "Non tutti i giocatori sono pronti!" });
        return;
    }

    // 3. Avvia
    console.log(`[Game] Start partita in ${roomId} da ${username}`);
    NotificationService.broadcastToRoom(io, roomId, 'gameStarted', {});
    // Qui puoi chiamare GameService.initializeGame(roomId)...
}

function attach(socket, io) {
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    socket.on('startGame', (payload) => handleStartGame(io, socket, payload)); // <--- NUOVO
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };