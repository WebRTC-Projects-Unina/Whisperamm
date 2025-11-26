// src/services/NotificationService.js
const { lobbies } = require('../socket/stateSocket');



class NotificationService {

    /**
     * 1. BROADCAST: Invia lo stesso payload a TUTTI nella stanza.
     * Utile per: Cambio fase, Inizio gioco (parte pubblica).
     */
    static broadcastToRoom(io, roomId, eventName, payload) {
        console.log(`[Notification] Broadcast '${eventName}' in ${roomId}`);
        io.to(roomId).emit(eventName, payload);
    }

    /**
     * 2. TARGETED: Invia payload diversi a singoli socket.
     * Utile per: Assegnazione ruoli, Parole segrete, Risultati votazioni personali.
     */
    static sendPersonalizedToRoom(io, roomId, players, eventName, payloadBuilderFn) {
        const roomSockets = lobbies.get(roomId);
        console.log("sendPersonalizedToRoom"+roomSockets)
        console.log(roomId)
        if (!roomSockets) return;

        players.forEach(player => {
            const socketId = roomSockets.get(player.username);
            console.log(socketId)
            if (socketId) {
                // Costruiamo il pacchetto specifico per l'utente
                const personalPayload = payloadBuilderFn(player);
                io.to(socketId).emit(eventName, personalPayload);
                console.log(personalPayload)
            }
            
        });

        
    }
}

module.exports = NotificationService;