// services/socketService.js
const { Room } = require('../models/Room');
const RoomService = require('./roomService');
const UserService = require('./userService');

//E' leggermente separata la logica delle socket dalla room, ma molto correlata.
//Questo perchè banalmente l'aggiunta di un utente nella room, avviene sia in Room semplice
//che poi successivamente nella lista di socket.
class SocketService {

    // ========== GESTIONE SOCKET) ==========
    
    /*
     * Registra il socket ID nel DB.
     * Ritorna l'eventuale vecchio socket-
     */
    static async registerConnection(roomId, username, newSocketId) {
        //Check per vedere se l'utente si era già connesso
        const oldSocketId = await Room.getSocket(roomId, username);
        await Room.setSocket(roomId, username, newSocketId); // Upsert
        return oldSocketId;
    }

    //Rimuove il socket dal DB SOLO se corrisponde a quello attuale (Protezione F5).
    static async unregisterConnection(roomId, username, socketIdToRemove) {
        const currentSocketId = await Room.getSocket(roomId, username);
        
        if (!currentSocketId || socketIdToRemove !== currentSocketId) {
            // È un socket vecchio o la connessione è già stata sovrascritta
            return false; 
        }

        await Room.deleteSocket(roomId, username);
        return true;
    }

    static async getSocketId(roomId, username) {
        return await Room.getSocket(roomId, username);
    }

    static async clearRoomSockets(roomId) {
        await Room.deleteAllSockets(roomId);
    }

}

module.exports = SocketService;