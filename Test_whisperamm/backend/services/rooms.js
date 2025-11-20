const { randomUUID } = require('crypto');

// Il nostro "database" in-memory.
const liveRooms = {};

/**
 * Crea una nuova stanza e la salva in memoria.
 * @param {string} roomName - Il nome visualizzato della stanza.
 * @param {object} user - L'oggetto utente che crea la stanza (host).
 * @param {int} maxPlayers - Numero massimo di giocatori
 * @param {int} rounds - Numero di round della partita
 * @returns {string} L'ID della stanza appena creata.
 */

const createRoom = (roomName, user, maxPlayers, rounds) => {
    const newRoomId = randomUUID().slice(0, 6).toUpperCase();

    liveRooms[newRoomId] = {
        roomId: newRoomId,
        name: roomName,
        players: [user], // L'utente che la crea è il primo giocatore
        hostId: user.username, // <-- Salviamo l'ID dell'host, non il nome
        maxPlayers: maxPlayers,
        rounds: rounds,
        createdAt: new Date()
    };

    return newRoomId;
};

/**
 * Elimina una stanza dalla memoria.
 * @param {string} roomId - L'ID della stanza da eliminare.
 * @returns {boolean} True se l'eliminazione ha avuto successo.
 */
const deleteRoom = (roomId) => {
    if (liveRooms[roomId]) {
        delete liveRooms[roomId];
        return true;
    }
    return false;
};

// --- GETTERS (per leggere i dati) ---

/**
 * (GETTER) Recupera l'oggetto completo di una singola stanza.
 * @param {string} roomId - L'ID della stanza da cercare.
 * @returns {object | undefined} L'oggetto stanza o undefined se non trovato.
 */
const getRoom = (roomId) => {
    return liveRooms[roomId];
};

/**
 * (GETTER) Recupera un array con tutte le stanze attive.
 * @returns {Array<object>} Un array di oggetti stanza.
 */
const getAllRooms = () => {
    return Object.values(liveRooms);
};

/**
 * (GETTER) Recupera solo la lista dei giocatori in una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @returns {Array<object> | null} Un array di oggetti utente o null.
 */
const getPlayers = (roomId) => {
    const room = liveRooms[roomId];
    return room ? room.players : null;
};

/**
 * (GETTER) Recupera il numero di giocatori ATTUALI in una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @returns {number | null} Il numero di giocatori o null se la stanza non esiste.
 */
const getNumberOfPlayers = (roomId) => {
    const room = getRoom(roomId);
    return room ? room.players.length : null;
};

/**
 * (GETTER) Recupera l'oggetto utente completo dell'host di una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @returns {object | null} L'oggetto utente dell'host o null.
 */
const getHost = (roomId) => {
    const room = getRoom(roomId);
    // --- MODIFICA ---
    // Troviamo l'host cercando l'ID salvato nella lista dei giocatori
    if (!room || !room.hostId) return null;
    return room.players.find(p => p.id === room.hostId) || null;
    // --- FINE MODIFICA ---
};

/**
 * (GETTER) Recupera il numero massimo di giocatori consentiti in una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @returns {number | null} Il numero massimo di giocatori o null se la stanza non esiste.
 */
const getMaxPlayers = (roomId) => {
    const room = getRoom(roomId);
    return room ? room.maxPlayers : null;
};
const getRoomName = (roomId) => {
    const room = getRoom(roomId);
    return room ? room.name : null;
}
// --- SETTERS / MUTATORS (per modificare i dati) ---

/**
 * (SETTER) Aggiunge un utente alla lista giocatori di una stanza.
 * @param {string} roomId - L'ID della stanza a cui unirsi.
 * @param {object} user - L'oggetto utente da aggiungere.
 * @returns {object} L'oggetto stanza aggiornato.
 */
const addUserToRoom = (roomId, user) => {
    const room = getRoom(roomId);

    if (!room) {
        throw new Error('Stanza non trovata. Impossibile unirsi.');
    }

    // Controlla se l'utente è già in stanza (per evitare duplicati)
    // Questa funzione usava già user.id, quindi è corretta!
    const userExists = room.players.find(p => p.id === user.username);

    if (!userExists) {
        room.players.push(user);
    }

    return room;
};

/**
 * (SETTER) Rimuove un utente da una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @param {string} userId - L'ID dell'utente da rimuovere.
 * @returns {object | null} L'oggetto stanza aggiornato, o null se la stanza è stata eliminata.
 */
const removeUserFromRoom = (roomId, userId) => {
    const room = getRoom(roomId);
    if (!room) return null; // Stanza già eliminata

    // --- MODIFICA ---
    // Controlliamo solo se l'utente esiste, non ci serve l'oggetto
    const userExists = room.players.some(p => p.id === userId);
    if (!userExists) return room; // Utente non trovato, non fare nulla
    // --- FINE MODIFICA ---

    // Rimuove l'utente dall'array
    room.players = room.players.filter(p => p.id !== userId);

    // --- Logica di pulizia automatica ---

    // 1. Se la stanza ora è vuota, eliminala per liberare memoria.
    if (room.players.length === 0) {
        deleteRoom(roomId);
        return null; // Ritorna null per segnalare che la stanza non esiste più
    }

    // 2. Se l'host (per ID) ha lasciato, nomina un nuovo host (salvando il nuovo ID)
    if (room.hostId === userId) {
        room.hostId = room.players[0].id; // Assegna l'ID del primo giocatore rimasto
    }

    return room;
};

/**
 * (SETTER) Aggiorna l'host di una stanza.
 * @param {string} roomId - L'ID della stanza.
 * @param {string} newHostId - L'ID (non il nome) del nuovo host.
 * @returns {object} L'oggetto stanza aggiornato.
 */
const updateHost = (roomId, newHostId) => {
    const room = getRoom(roomId);
    if (room) {
        // --- MODIFICA ---
        room.hostId = newHostId;
        // --- FINE MODIFICA ---
        return room;
    }
    throw new Error('Stanza non trovata.');
};

/**
 * (BOOLEAN) Controlla se una stanza esiste.
 * @param {string} roomId - L'ID della stanza da controllare.
 * @returns {boolean} True se la stanza esiste, altrimenti false.
 */
const roomExists = (roomId) => {
    return !!liveRooms[roomId];
};

/**
 * (BOOLEAN) Controlla se un utente (per ID) è già presente in una stanza.
 * @param {string} roomId - L'ID della stanza da controllare.
 * @param {string} userId - L'ID dell'utente da cercare (basato su user.id).
 * @returns {boolean} True se l'utente è nella stanza, altrimenti false.
 */
const isUserInRoom = (roomId, userId) => {
    const room = getRoom(roomId);

    if (!room) {
        return false;
    }

    // Controlla per ID
    return room.players.some(player => player.id === userId);
};


// Esportiamo tutte le funzioni che vogliamo rendere pubbliche
module.exports = {
    createRoom,
    deleteRoom,
    getRoom,
    getAllRooms,
    getPlayers,
    getHost,
    getMaxPlayers,
    getNumberOfPlayers,
    addUserToRoom,
    removeUserFromRoom,
    updateHost,
    roomExists,
    isUserInRoom
};