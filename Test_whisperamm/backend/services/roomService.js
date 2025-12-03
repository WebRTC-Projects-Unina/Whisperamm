// services/roomService.js
const { Room, RoomStatus } = require('../models/Room');
const UserService = require('./userService');
const crypto = require('crypto');

class RoomService {
    
    // ==========================================
    // CREAZIONE E VALIDAZIONE
    // ==========================================

    static async createRoom(roomName, hostUsername, maxPlayers, rounds) {
        if (!roomName || typeof roomName !== 'string') throw new Error('ROOM_NAME_REQUIRED');
        const trimmedName = roomName.trim();
        if (trimmedName.length < 3) throw new Error('ROOM_NAME_TOO_SHORT');
        if (maxPlayers < 2 || maxPlayers > 10) throw new Error('INVALID_MAX_PLAYERS');
        
        const hostExists = await UserService.userExists(hostUsername);
        if (!hostExists) throw new Error('HOST_NOT_FOUND');

        const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();
        const createdId = await Room.create(roomId, trimmedName, hostUsername, maxPlayers, rounds);
        
        if (!createdId) throw new Error('ROOM_CREATION_FAILED');
        return roomId;
    }

    static async checkRoomAccess(roomId, username) {
        const room = await Room.get(roomId);
        
        if (!room) {
            return { canJoin: false, reason: 'ROOM_NOT_FOUND', room: null };
        }

        const isAlreadyIn = await Room.isPlayerInRoom(roomId, username);
        if (isAlreadyIn) {
            return { canJoin: true, reason: 'ALREADY_IN_ROOM', isRejoining: true, room };
        }

        if (room.currentPlayers >= room.maxPlayers) {
            return { canJoin: false, reason: 'ROOM_FULL', room };
        }

        if (room.status !== RoomStatus.WAITING) {
            return { canJoin: false, reason: 'GAME_STARTED', room };
        }

        return { canJoin: true, reason: 'CAN_JOIN', isRejoining: false, room };
    }

    // ==========================================
    // GESTIONE ACCESSO TRANSAZIONALE (Socket)
    // ==========================================

    static async addPlayerToRoom(roomId, username, socketId) {
        const userExists = await UserService.userExists(username);
        if (!userExists) throw new Error('USER_NOT_FOUND');

        // 1. CHECK REJOIN: Deleghiamo al Model il controllo della history
        const alreadyHasHistory = await Room.hasSocketHistory(roomId, username);

        // 2. TRANSAZIONE: Deleghiamo al Model l'esecuzione atomica
        const [sAddResult, hSetResult] = await Room.joinTransaction(roomId, username, socketId);

        // sAddResult è 1 se l'elemento è nuovo, 0 se esisteva già
        return { 
            added: sAddResult === 1, 
            isRejoin: alreadyHasHistory, 
            room: await Room.get(roomId) 
        };
    }

    static async removePlayerFromRoom(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) return { deletedRoom: true };

        await UserService.setUserReady(username, false);

        // TRANSAZIONE: Deleghiamo al Model la rimozione sicura
        // Ritorna: [risultatoRimozionePlayer, risultatoResetSocket, arrayPlayerRimanenti]
        const [remPlayer, remSocket, remainingPlayers] = await Room.leaveTransaction(roomId, username);

        const activePlayers = remainingPlayers || [];
        let deletedRoom = false;
        let hostChanged = false;
        let updatedRoom = null;

        if (activePlayers.length === 0) {
            await Room.delete(roomId);
            deletedRoom = true;
        } else {
            if (room.host === username) {
                const newHost = activePlayers[0];
                await Room.updateHost(roomId, newHost);
                hostChanged = true;
            }
            updatedRoom = await Room.get(roomId);
        }
        
        return { updatedRoom, hostChanged, deletedRoom };
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    static async isUserHost(roomId, username) {
        const host = await Room.getHost(roomId);
        return host === username;
    }

    static async getPlayers(roomId) { return await Room.getPlayers(roomId); }
    static async getRoom(roomId) { return await Room.get(roomId); }
    static async getHost(roomId) { return await Room.getHost(roomId); }

    static async getReadyStates(roomId) {
        const room = await Room.get(roomId);
        if (!room) return {};
        const playersToCheck = room.players.filter(p => p !== room.host);
        const readyStates = await UserService.getMultipleUsersReady(playersToCheck);
        readyStates[room.host] = true; 
        return readyStates;
    }

    static async checkAllUsersReady(roomId) {
        const room = await Room.get(roomId);
        if (!room || room.players.length < 2) return { allReady: false, readyStates: {} };
        const readyStates = await this.getReadyStates(roomId);
        const allReady = room.players.every(u => readyStates[u] === true);
        return { allReady, readyStates };
    }

    static async setAllPlayersInGame(roomId) {
        // Recuperiamo la lista dei giocatori
        const players = await Room.getPlayers(roomId);
        if (!players || players.length === 0) return;

        // Usiamo UserService per settare lo stato (UserStatus.INGAME)
        // Assicurati che UserService abbia un metodo adatto, altrimenti lo facciamo qui
        return await UserService.setMultipleUsersStatus(players, UserService.UserStatus.INGAME);
    }
}

module.exports = RoomService;