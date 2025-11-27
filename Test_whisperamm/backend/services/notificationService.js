// ../services/notificationService.js
const SocketService = require('./socketService');

class NotificationService {

    /**
     * 1. BROADCAST: Invia lo stesso payload a TUTTI nella stanza.
     * Utile per: Cambio fase, Inizio gioco (parte pubblica), Chat e altri eventi 
     */
    static broadcastToRoom(io, roomId, eventName, payload) {
        // Questo rimane invariato, Socket.io gestisce la room internamente
        io.to(roomId).emit(eventName, payload);
    }

    /**
     * 2. TARGETED: Invia payload diversi a singoli socket.
     * Utile per: Assegnazione ruoli segreti, Carte personali, Risultati specifici.
     * * @param {Server} io - Istanza Socket.io
     * @param {string} roomId - ID della stanza
     * @param {Array} players - Array di oggetti utente (deve contenere .username)
     * @param {string} eventName - Nome dell'evento da emettere
     * @param {Function} payloadBuilderFn - Funzione che prende (player) e ritorna il payload specifico
     */
    static async sendPersonalizedToRoom(io, roomId, players, eventName, payloadBuilderFn) {
        
        // Creiamo un array di Promise per gestire l'invio in parallelo
        // (molto più veloce di un for-loop sequenziale con await)
        const notifications = players.map(async (player) => {
            const username = player.username; // Assumiamo players sia array di oggetti User
            
            // 1. Recuperiamo il socket ID da Redis tramite il Service
            const socketId = await SocketService.getSocketId(roomId, username);

            if (socketId) {
                // 2. Costruiamo il pacchetto specifico per l'utente
                const personalPayload = payloadBuilderFn(player);
                
                // 3. Inviamo al singolo socket
                io.to(socketId).emit(eventName, personalPayload);
            }
        });
        
    }
}

module.exports = NotificationService;