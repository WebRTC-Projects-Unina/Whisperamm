const {Room} = require("../services/rooms")

const {
    getRoom,
    addUserToRoom,
    removeUserFromRoom,
    roomExists,
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

function addPresence(gameId, username, socketId) {
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


async function canUserJoinRoom(room, username) {
    const players = await Room.getPlayers(room.roomId);
    const isUserAlreadyIn = players.includes(username);
    const isRoomFull = players.length >= room.maxPlayers;
    const canJoin = !isRoomFull || isUserAlreadyIn;
    return { isUserAlreadyIn, isRoomFull, canJoin, players};
    
}


// --- HANDLER MODULARI ---

async function handleJoinLobby(io, socket, { gameId, user }) {
    if (!gameId || !user) return;

    const username = user.username;
    /*1. ANNULLA IL TIMER se l'utente si è riconnesso
    if (disconnectTimeouts.has(userId)) {
        clearTimeout(disconnectTimeouts.get(userId));
        disconnectTimeouts.delete(userId);
        console.log(`[Socket] Riconnessione riuscita! Timer di disconnessione per ${name} annullato.`);
    }
    */

    const room = await Room.get(gameId);
    if (!room) {
        socket.emit('lobbyError', { message: 'Stanza non trovata' });
        return;
    }
    //Fino a qui tutto ok

    //L'utente può entrare solo se: 
    // 1. l'utente non è già dentro
    // 2. la room non è piena
    const { isUserAlreadyIn, isRoomFull, canJoin, players} = await canUserJoinRoom(room, username);

    if (!canJoin) {
        socket.emit('lobbyError', { message: 'La stanza è piena.' });
        return;
    }

    if (!isUserAlreadyIn) {
        addUserToRoom(gameId, user);
        console.log(`[Socket] Utente ${username} aggiunto in ${gameId}`);
    } else {
        console.log(`[Socket] Utente ${username} già presente in ${gameId}, non lo ri-aggiungo`);
    }

    // Metadati sul socket
    socket.data.gameId = gameId;
    socket.data.username = username;

    //const { isFirstConnection } = addPresence(gameId, username, socket.id);
    //socket.join(gameId);

    // Se l'utente si ricollega, isFirstConnection sarà false se ci sono
    // altre connessioni attive (improbabile con un reload) o se la sessione
    // è stata recuperata (socket.recovered), ma inviamo il messaggio solo se è
    // la prima connessione assoluta dell'utente (è entrato ora).
    /*if (isFirstConnection) {
        socket.to(gameId).emit('chatMessage', {
            from: 'system',
            text: `${name} è entrato nella lobby`,
        });
    }*/

   
    socket.emit('lobbyPlayers', { 
        players: players
    });

}
/*
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

        // Rimuovi l'utente dalla stanza
        const updatedRoom = removeUserFromRoom(gameId, userId);

        if (!updatedRoom) {
            console.log(`[Timer] Stanza ${gameId} vuota, eliminata.`);
            // Nessuna notifica se la stanza non esiste più (eliminata da removeUserFromRoom)
            disconnectTimeouts.delete(userId);
            return;
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
*/

// --- REGISTRAZIONE HANDLER PRINCIPALE e secondari.
//  Dopo l'handshaking, il client emette un 'connection' e dunque qui quando lo rileva parte sta funzione

//Al momento sono solo stampe
module.exports = function registerChatHandlers(io) {
    io.on('connection', (socket) => {


        //console.log('Nuovo socket connesso:', socket.id);
        
        // Controlla se il socket si è riconnesso e ha recuperato la vecchia sessione
        /*const isNewSession = socket.recovered;

        if (isNewSession) {
            console.log(`Riconnessione riuscita, sessione recuperata. ${isNewSession}`);
        } else {
            console.log('Nuova sessione, mi unisco alla lobby.');
        }*/ 


        // Il client DEVE emettere 'joinLobby' ad ogni connessione riuscita (nuova O recuperata).
        // L'handler di 'joinLobby' ora gestisce l'annullamento del timer di disconnessione.
        socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
        //payload {user,gameId}

        //socket.on('disconnect', () => handleDisconnect(io, socket));
        //socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));*/
    });
};