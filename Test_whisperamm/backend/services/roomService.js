// services/roomService.js
const { Room, RoomStatus } = require('../models/Room');
const { User } = require('../models/User');
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

        const hostExists = await User.exists(hostUsername);
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
        // Verifica accesso 
        const accessCheck = await this.checkRoomAccess(roomId, username);
        if (!accessCheck.canJoin) {throw new Error(accessCheck.reason);}

        if (accessCheck.isRejoining) {
            return { added: false, isRejoining: true, room: accessCheck.room };
        }

        const userExists = await User.exists(username);
        if (!userExists) throw new Error('USER_NOT_FOUND');

        const success = await Room.addPlayer(roomId, username);
        if (!success) throw new Error('ADD_PLAYER_FAILED');

        console.log(`[RoomService] Giocatore ${username} aggiunto logica room ${roomId}`);
        
        return { added: true, isRejoining: false, room: await Room.get(roomId) };
    }

    static async removePlayerFromRoom(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) throw new Error('ROOM_NOT_FOUND');

        const remainingCount = await Room.removePlayer(roomId, username);
        if (remainingCount === -1) throw new Error('ROOM_NOT_FOUND');

        // Elimina stanza se vuota
        if (remainingCount === 0) {
            await Room.delete(roomId);
            console.log(`[RoomService] Stanza ${roomId} eliminata (vuota)`);
            return null; // Stanza non esiste più
        }

        // Cambio Host
        if (room.host === username) {
            const players = await Room.getPlayers(roomId);
            if (players.length > 0) {
                await Room.updateHost(roomId, players[0]);
                console.log(`[RoomService] Nuovo host in ${roomId}: ${players[0]}`);
            }
        }

        return await Room.get(roomId);
    }

    // --- UTILITIES ---

    static async isUserHost(roomId, username) {
        const room = await Room.get(roomId);
        return room && room.host === username;
    }

    static async getPlayers(roomId) {
        // Opzionale: check exists
        return await Room.getPlayers(roomId);
    }

    static async getRoom(roomId) {
        return await Room.get(roomId);
    }

    static async getAllRooms() {
        return await Room.getAll();
    }

    // --- GAME STATUS & READY ---

    static async updateRoomStatus(roomId, newStatus) {
        await Room.updateStatus(roomId, newStatus);
    }

    static async getReadyStates(roomId) {
        const room = await this.getRoom(roomId);
        if(!room) return {};

        const UserService = require('./userService'); // Require lazy per evitare cicli
        
        const playersToCheck = room.players.filter(p => p !== room.host);
        const readyStates = await UserService.getMultipleUsersReady(playersToCheck);
        readyStates[room.host] = true; // Host sempre pronto

        return readyStates;
    }

    static async checkAllUsersReady(roomId) {
        const room = await this.getRoom(roomId);
        if(!room) return { allReady: false, readyStates: {} };

        if (room.players.length < 2) return { allReady: false, readyStates: {} };
        const readyStates = await this.getReadyStates(roomId);
        
        // Verifica che ogni giocatore nella lista della stanza sia 'true' in readyStates
        const allReady = room.players.every(u => readyStates[u] === true);
        
        return { allReady, readyStates };
    }
}

module.exports = RoomService;