// services/roomService.js
const { Room, RoomStatus } = require('../models/Room');
const { User } = require('../models/User');
const crypto = require('crypto');

class RoomService {
    /**
     * Crea una nuova stanza con validazione.
     */
    static async createRoom(roomName, hostUsername, maxPlayers = 4, rounds = 5) {
        // Validazione nome stanza
        if (!roomName || typeof roomName !== 'string') {
            throw new Error('ROOM_NAME_REQUIRED');
        }

        const trimmedName = roomName.trim();
        if (trimmedName.length < 3) {
            throw new Error('ROOM_NAME_TOO_SHORT');
        }

        if (trimmedName.length > 50) {
            throw new Error('ROOM_NAME_TOO_LONG');
        }

        // Validazione maxPlayers
        if (maxPlayers < 2 || maxPlayers > 10) {
            throw new Error('INVALID_MAX_PLAYERS');
        }

        // Validazione rounds
        if (rounds < 1 || rounds > 20) {
            throw new Error('INVALID_ROUNDS');
        }

        // Verifica che l'host esista
        const hostExists = await User.exists(hostUsername);
        if (!hostExists) {
            throw new Error('HOST_NOT_FOUND');
        }

        // Genera un ID univoco
        const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();

        // Crea la stanza
        const createdRoomId = await Room.create(
            roomId,
            trimmedName,
            hostUsername,
            maxPlayers,
            rounds
        );

        if (!createdRoomId) {
            throw new Error('ROOM_CREATION_FAILED');
        }

        console.log(`[Service] Stanza ${roomId} creata con successo da ${hostUsername}`);

        return roomId;
    }

    /**
     * Verifica se un utente può entrare in una stanza.
     * Ritorna un oggetto con informazioni sullo stato.
     */
    static async checkRoomAccess(roomId, username) {
        // Verifica esistenza stanza
        const room = await Room.get(roomId);
        if (!room) {
            return {
                canJoin: false,
                reason: 'ROOM_NOT_FOUND',
                room: null
            };
        }

        // Verifica se l'utente è già nella stanza
        const isAlreadyIn = await Room.isPlayerInRoom(roomId, username);
        if (isAlreadyIn) {
            return {
                canJoin: true,
                reason: 'ALREADY_IN_ROOM',
                room,
                isRejoining: true
            };
        }

        // Verifica se la stanza è piena
        const currentPlayers = await Room.countPlayers(roomId);
        if (currentPlayers >= room.maxPlayers) {
            return {
                canJoin: false,
                reason: 'ROOM_FULL',
                room
            };
        }

        // Verifica se la partita è già iniziata
        if (room.status !== RoomStatus.WAITING) {
            return {
                canJoin: false,
                reason: 'GAME_ALREADY_STARTED',
                room
            };
        }

        // Può entrare
        return {
            canJoin: true,
            reason: 'CAN_JOIN',
            room,
            isRejoining: false
        };
    }

    /**
     * Aggiunge un giocatore a una stanza dopo aver verificato i permessi.
     */
    static async addPlayerToRoom(roomId, username) {
        // Verifica accesso
        const accessCheck = await this.checkRoomAccess(roomId, username);

        if (!accessCheck.canJoin) {
            throw new Error(accessCheck.reason);
        }

        // Se è già dentro, non fare nulla
        if (accessCheck.isRejoining) {
            return {
                added: false,
                isRejoining: true,
                room: accessCheck.room
            };
        }

        // Verifica che l'utente esista
        const userExists = await User.exists(username);
        if (!userExists) {
            throw new Error('USER_NOT_FOUND');
        }

        // Aggiungi il giocatore
        const success = await Room.addPlayer(roomId, username);
        if (!success) {
            throw new Error('ADD_PLAYER_FAILED');
        }

        console.log(`[Service] Giocatore ${username} aggiunto alla stanza ${roomId}`);

        // Recupera la stanza aggiornata
        const updatedRoom = await Room.get(roomId);

        return {
            added: true,
            isRejoining: false,
            room: updatedRoom
        };
    }

    /**
     * Rimuove un giocatore da una stanza.
     * Gestisce la riassegnazione dell'host e l'eliminazione della stanza vuota.
     */
    static async removePlayerFromRoom(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) {
            throw new Error('ROOM_NOT_FOUND');
        }

        // Rimuovi il giocatore
        const remainingCount = await Room.removePlayer(roomId, username);

        if (remainingCount === -1) {
            throw new Error('ROOM_NOT_FOUND');
        }

        // Se la stanza è vuota, eliminala
        if (remainingCount === 0) {
            await Room.delete(roomId);
            console.log(`[Service] Stanza ${roomId} eliminata (vuota)`);
            return null;
        }

        // Se l'host ha lasciato, nomina un nuovo host
        if (room.host === username) {
            const players = await Room.getPlayers(roomId);
            if (players.length > 0) {
                await Room.updateHost(roomId, players[0]);
                console.log(`[Service] Nuovo host in ${roomId}: ${players[0]}`);
            }
        }

        // Recupera la stanza aggiornata
        const updatedRoom = await Room.get(roomId);
        return updatedRoom;
    }

    /**
     * Verifica se un utente è l'host della stanza.
     */
    static async isUserHost(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) {
            throw new Error('ROOM_NOT_FOUND');
        }
        return room.host === username;
    }

    /**
     * Ottiene i giocatori di una stanza.
     */
    static async getPlayers(roomId) {
        const exists = await Room.exists(roomId);
        if (!exists) {
            throw new Error('ROOM_NOT_FOUND');
        }
        return await Room.getPlayers(roomId);
    }

    /**
     * Ottiene una stanza.
     */
    static async getRoom(roomId) {
        const room = await Room.get(roomId);
        if (!room) {
            throw new Error('ROOM_NOT_FOUND');
        }
        return room;
    }

    /**
     * Ottiene tutte le stanze attive.
     */
    static async getAllRooms() {
        return await Room.getAll();
    }

    /**
     * Verifica se un utente è già in una stanza.
     */
    static async isUserInRoom(roomId, username) {
        const exists = await Room.exists(roomId);
        if (!exists) {
            throw new Error('ROOM_NOT_FOUND');
        }
        return await Room.isPlayerInRoom(roomId, username);
    }

    /**
     * Aggiorna lo status di una stanza.
     */
    static async updateRoomStatus(roomId, newStatus) {
        const success = await Room.updateStatus(roomId, newStatus);
        if (!success) {
            throw new Error('ROOM_NOT_FOUND');
        }
    }

    /**
     * Controlla se tutti gli utenti sono pronti (ESCLUSO L'ADMIN).
     */
    static async checkAllUsersReady(roomId) {
        const room = await this.getRoom(roomId);
        
        const UserService = require('./userService');
        
        // Filtra i giocatori ESCLUDENDO l'admin
        const playersToCheck = room.players.filter(p => p !== room.host);

        // Se non ci sono giocatori da controllare (solo admin)
        if (playersToCheck.length === 0) {
            return { 
                allReady: true, 
                readyStates: { [room.host]: true } 
            };
        }

        // Recupera lo stato "ready" di tutti i giocatori
        const readyStates = await UserService.getMultipleUsersReady(playersToCheck);
        
        // L'admin è sempre considerato "ready"
        readyStates[room.host] = true;

        // Verifica se TUTTI i giocatori (escluso admin) sono pronti
        const allReady = playersToCheck.every(username => readyStates[username] === true);
        
        return { allReady, readyStates };
    }

    /**
     * Ottiene lo stato "ready" di tutti i giocatori (ESCLUSO L'ADMIN).
     */
    static async getReadyStates(roomId) {
        const room = await this.getRoom(roomId);
        
        const UserService = require('./userService');
        
        const playersToCheck = room.players.filter(p => p !== room.host);
        const readyStates = await UserService.getMultipleUsersReady(playersToCheck);
        
        // L'admin è sempre considerato "ready"
        readyStates[room.host] = true;

        return readyStates;
    }
}

module.exports = RoomService;