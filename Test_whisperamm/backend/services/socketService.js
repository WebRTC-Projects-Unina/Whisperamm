// services/socketService.js
const { Room } = require('../models/Room'); 

class SocketService {

    /**
     * Recupera il socket ID salvato su Redis per un dato utente.
     * Utile per verificare se una richiesta proviene dalla connessione attiva.
     */
    static async getSocketId(roomId, username) {
        return await Room.getSocket(roomId, username);
    }

    /**
     * Rimuove l'intera mappa dei socket per una stanza (usato quando la stanza viene distrutta).
     */
    static async clearRoomSockets(roomId) {
        await Room.deleteAllSockets(roomId);
    }
}

module.exports = SocketService;