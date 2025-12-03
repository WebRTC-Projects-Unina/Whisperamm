const { Room, RoomStatus } = require('../models/Room');
const UserService = require('./userService');
const crypto = require('crypto');

class RoomService {
    
    // --- CREAZIONE E VALIDAZIONE ---

    static async createRoom(roomName, hostUsername, maxPlayers, rounds) {
        if (!roomName || typeof roomName !== 'string') throw new Error('ROOM_NAME_REQUIRED');
        
        const trimmedName = roomName.trim();
        if (trimmedName.length < 3) throw new Error('ROOM_NAME_TOO_SHORT');
        if (trimmedName.length > 50) throw new Error('ROOM_NAME_TOO_LONG');
        if (maxPlayers < 2 || maxPlayers > 10) throw new Error('INVALID_MAX_PLAYERS');
        if (rounds < 1 || rounds > 20) throw new Error('INVALID_ROUNDS');

        const hostExists = await UserService.userExists(hostUsername);
        if (!hostExists) throw new Error('HOST_NOT_FOUND');

        const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();

        const createdRoomId = await Room.create(
            roomId,
            trimmedName,
            hostUsername,
            maxPlayers,
            rounds
        );

        if (!createdRoomId) throw new Error('ROOM_CREATION_FAILED');

        return roomId;
    }

    // --- GESTIONE ACCESSO ---
    static async checkRoomAccess(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) {
            return { canJoin: false, reason: 'ROOM_NOT_FOUND', room: null };
        }

        const isAlreadyIn = await Room.isPlayerInRoom(roomId, username);
        if (isAlreadyIn) {
            return { canJoin: true, reason: 'ALREADY_IN_ROOM', room, isRejoining: true };
        }

        const currentPlayers = await Room.countPlayers(roomId);
        if (currentPlayers >= room.maxPlayers) {
            return { canJoin: false, reason: 'ROOM_FULL', room };
        }

        if (room.status !== RoomStatus.WAITING) {
            return { canJoin: false, reason: 'GAME_ALREADY_STARTED', room };
        }

        return { canJoin: true, reason: 'CAN_JOIN', room, isRejoining: false };
    }

    static async addPlayerToRoom(roomId, username) {
        const userExists = await UserService.userExists(username);
        if (!userExists) throw new Error('USER_NOT_FOUND');

        const success = await Room.addPlayer(roomId, username);
        if (!success) throw new Error('ADD_PLAYER_FAILED');

        return { added: true, isRejoining: false, room: await Room.get(roomId) };
    }

    static async removePlayerFromRoom(roomId, username) {
        let deletedRoom = false;
        let updatedRoom = null;
        let hostChanged = false;
        
        const room = await Room.get(roomId);
        if (!room) throw new Error('ROOM_NOT_FOUND');

        await UserService.setUserReady(username, false);
        
        let players = await Room.removePlayer(roomId, username);
        let playerNumber = players.length;
        
        if (playerNumber === 0) {
            await Room.delete(roomId);
            await Room.deleteAllSockets(roomId);
            deletedRoom = true; 
        } else {
            if (room.host === username) { 
                const players = await Room.getPlayers(roomId);
                if (players && players.length > 0) {
                    const newHost = players[0];
                    await Room.updateHost(roomId, newHost);
                    hostChanged = true;
                }
            }
            updatedRoom = await Room.get(roomId);
        }
        
        return { updatedRoom, hostChanged, deletedRoom };
    }

    // --- UTILITIES ---

    static async isUserHost(roomId, username) {
        // Qui usiamo getHost ottimizzato invece di getRoom
        const host = await this.getHost(roomId); 
        return host === username;
    }

    static async getPlayers(roomId) {
        return await Room.getPlayers(roomId);
    }

    static async getRoom(roomId) {
        return await Room.get(roomId);
    }

    static async getAllRooms() {
        return await Room.getAll();
    }

    // --- METODO AGGIORNATO E OTTIMIZZATO ---
    static async getHost(roomId) {
        // Chiama direttamente il metodo ottimizzato del Model (HGET)
        // Invece di scaricare tutta la stanza
        return await Room.getHost(roomId);
    }

    // --- GAME STATUS & READY ---

    static async updateRoomStatus(roomId, newStatus) {
        await Room.updateStatus(roomId, newStatus);
    }

    static async getReadyStates(roomId) {
        // Qui serve l'oggetto completo perché dobbiamo escludere l'host dalla lista check
        // (anche se si potrebbe ottimizzare recuperando solo players e host separatamente)
        const room = await this.getRoom(roomId);
        if (!room) return {};
        
        const playersToCheck = room.players.filter(p => p !== room.host);
        const readyStates = await UserService.getMultipleUsersReady(playersToCheck);
        readyStates[room.host] = true; 

        return readyStates;
    }

    static async checkAllUsersReady(roomId) {
        const room = await this.getRoom(roomId);
        if (!room) return { allReady: false, readyStates: {} };

        if (room.players.length < 2) return { allReady: false, readyStates: {} };
        const readyStates = await this.getReadyStates(roomId);

        const allReady = room.players.every(u => readyStates[u] === true);
        return { allReady, readyStates };
    }

    static async setAllPlayersInGame(roomId) {
        const players = await this.getPlayers(roomId)
        if (!players) throw new Error('PLAYERS_NOT_FOUND');
        return await UserService.setMultipleUsersStatus(players, UserService.UserStatus.INGAME);
    }

    static async setAllPlayersOnline(roomId) {
        const room = await this.getRoom(roomId);
        if (!room) throw new Error('ROOM_NOT_FOUND');
        return await UserService.setMultipleUsersStatus(room.players, UserService.UserStatus.ONLINE);
    }
}

module.exports = RoomService;