const {
    getRoom,
    addUserToRoom,
    removeUserFromRoom,
    roomExists,
    getPlayers,
    updateHost
} = require("../services/rooms");

// Struttura dati: Map<gameId, Map<userId, Set<socket.id>>>
const lobbies = new Map();

// --- NUOVE STRUTTURE PER GESTIONE RICONNESSIONE ---

// Map<userId, Timeout> per tenere traccia dei timer di disconnessione
const disconnectTimeouts = new Map();
const RECONNECT_TOLERANCE_MS = 5000; // 5 secondi di tolleranza

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
        // Non eliminiamo l'utente/lobby qui, lo faremo dopo il timeout in handleDisconnect
        // Manteniamo solo la pulizia della struttura di presenza del socket
        if (connections.size === 0) {
            lobby.delete(userId);
            // La lobby non viene cancellata qui, handleDisconnect farà partire il timer
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

    // 💡 1. ANNULLA IL TIMER se l'utente si è riconnesso
    if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId));
        disconnectTimeouts.delete(userId);
        console.log(`[Socket] Riconnessione riuscita! Timer di disconnessione per ${name} annullato.`);
    }

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

    // Se l'utente si ricollega, isFirstConnection sarà false se ci sono
    // altre connessioni attive (improbabile con un reload) o se la sessione
    // è stata recuperata (socket.recovered), ma inviamo il messaggio solo se è
    // la prima connessione assoluta dell'utente (è entrato ora).
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
    if (!isLastConnection) return; // Non è l'ultima connessione di questo utente, ignora

    console.log(`${username} (ID: ${userId}) è offline da ${gameId}. Avvio timer di tolleranza...`);

    // 1. Pulisci un eventuale vecchio timer (sicurezza)
    if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId));
    }

    // 2. Avvia il timer di tolleranza
    const timeout = setTimeout(() => {
        // Questa funzione viene eseguita se l'utente NON si è riconnesso entro RECONNECT_TOLERANCE_MS
        // ✅ AGGIUNGI QUESTA LOGICA: Prendi il room PRIMA di rimuovere l'utente
        const room = getRoom(gameId);
        const wasAdmin = room && room.hostId === username;
        // Rimuovi l'utente dalla stanza
        const updatedRoom = removeUserFromRoom(gameId, username);

        if (!updatedRoom) {
            console.log(`[Timer] Stanza ${gameId} vuota, eliminata.`);
            // Nessuna notifica se la stanza non esiste più (eliminata da removeUserFromRoom)
            disconnectTimeouts.delete(userId);
            return;
        }

        // ✅ AGGIUNGI: Se era admin e ci sono ancora giocatori
        if (wasAdmin) {
            const remainingPlayers = getPlayers(gameId);
            
            if (remainingPlayers && remainingPlayers.length > 0) {
                const newAdmin = remainingPlayers[0];
                
                // ✅ USA updateHost per cambiare l'admin
                updateHost(gameId, newAdmin.id);
                
                console.log(`[Timer] Admin disconnesso. Nuovo admin: ${newAdmin.username}`);
                
                // ✅ NOTIFICA: Informa tutti i giocatori del cambio admin
                io.to(gameId).emit('adminChanged', {
                    newAdmin: newAdmin.username,
                    newAdminId: newAdmin.id,
                    message: `${username} è disconnesso. ${newAdmin.username} è il nuovo admin.`
                });
            }
        }
    
        console.log(`[Timer] Timeout scaduto. ${username} rimosso definitivamente da ${gameId}.`);

        // Notifica la rimozione definitiva
        io.to(gameId).emit('chatMessage', {
            from: 'system',
            text: `${username} ha lasciato la lobby`,
        });

        // Aggiorna la lista dei giocatori
        const players = updatedRoom.players;
        io.to(gameId).emit('lobbyPlayers', {
            gameId,
            players: players.map(p => p.username),
        });

        disconnectTimeouts.delete(userId); // Rimuovi il timer dalla mappa

    }, RECONNECT_TOLERANCE_MS);

    disconnectTimeouts.set(userId, timeout);
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
        console.log('Nuovo socket connesso:', socket.id);

        // Controlla se il socket si è riconnesso e ha recuperato la vecchia sessione
        const isNewSession = socket.recovered;

        if (isNewSession) {
            console.log(`Riconnessione riuscita, sessione recuperata. ${isNewSession}`);
        } else {
            console.log('Nuova sessione, mi unisco alla lobby.');
        }

        // Il client DEVE emettere 'joinLobby' ad ogni connessione riuscita (nuova O recuperata).
        // L'handler di 'joinLobby' ora gestisce l'annullamento del timer di disconnessione.
        socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
        socket.on('disconnect', () => handleDisconnect(io, socket));
        socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    });
};