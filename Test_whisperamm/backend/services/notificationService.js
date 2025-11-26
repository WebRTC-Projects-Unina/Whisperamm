// src/services/NotificationService.js
const { lobbies } = require('../socket/stateSocket');



class NotificationService {

    /**
     * 1. BROADCAST: Invia lo stesso payload a TUTTI nella stanza.
     * Utile per: Cambio fase, Inizio gioco (parte pubblica).
     */
    static broadcastToRoom(io, roomId, eventName, payload) {
        io.to(roomId).emit(eventName, payload);
    }

    /**
     * 2. TARGETED: Invia payload diversi a singoli socket.
     * Utile per: Assegnazione ruoli, Parole segrete, Risultati votazioni personali.
     */
    static sendPersonalizedToRoom(io, roomId, players, eventName, payloadBuilderFn) {
        const lobby = lobbies.get(roomId);
    
        if (!lobby) return;

        players.forEach(player => {
            const socketId = lobby.get(player.username);
            if (socketId) {
                // Costruiamo il pacchetto specifico per l'utente
                const personalPayload = payloadBuilderFn(player);
                io.to(socketId).emit(eventName, personalPayload);
            }
            
        });

        
    }
}

module.exports = NotificationService;