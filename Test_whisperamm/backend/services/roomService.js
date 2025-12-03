// services/RoomService.js
const { Room, RoomStatus } = require('../models/Room');
const UserService = require('./userService');
const { getRedisClient } = require('../models/redis'); // Importato SOLO per removePlayer
const crypto = require('crypto');
const { stat } = require('fs');

class RoomService {
    
    // ==========================================
    // CASO SEMPLICE: Delega al Model
    // ==========================================

    static async createRoom(roomName, hostUsername, maxPlayers, rounds) {
        if (!roomName || typeof roomName !== 'string') throw new Error('ROOM_NAME_REQUIRED');
        const trimmedName = roomName.trim();
        if (trimmedName.length < 3) throw new Error('ROOM_NAME_TOO_SHORT');
        if (maxPlayers < 2 || maxPlayers > 10) throw new Error('INVALID_MAX_PLAYERS');
        
        const hostExists = await UserService.userExists(hostUsername);
        if (!hostExists) throw new Error('HOST_NOT_FOUND');

        const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();
        
        // Il Model gestisce la transazione internamente
        const createdId = await Room.create(roomId, trimmedName, hostUsername, maxPlayers, rounds);
        
        if (!createdId) throw new Error('ROOM_CREATION_FAILED');
        return roomId;
    }

    static async checkRoomAccess(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) return { canJoin: false, reason: 'ROOM_NOT_FOUND', room: null };

        const isAlreadyIn = await Room.isPlayerInRoom(roomId, username);
        if (isAlreadyIn) return { canJoin: true, reason: 'ALREADY_IN_ROOM', isRejoining: true, room };

        if (room.currentPlayers >= room.maxPlayers) return { canJoin: false, reason: 'ROOM_FULL', room };
        //if (room.status !== RoomStatus.WAITING) return { canJoin: false, reason: 'GAME_STARTED', room };

        return { canJoin: true, reason: 'CAN_JOIN', isRejoining: false, room };
    }

    static async addPlayerToRoom(roomId, username, socketId) {
        const userExists = await UserService.userExists(username);
        if (!userExists) throw new Error('USER_NOT_FOUND');

        // Check history (Lettura)
        const alreadyHasHistory = await Room.hasSocketHistory(roomId, username);
        
        // Transazione interna al Model (Semplice: Add Player + Set Socket)
        const [sAddResult, hSetResult] = await Room.joinTransaction(roomId, username, socketId);

        return { 
            added: sAddResult === 1, 
            isRejoin: alreadyHasHistory, 
            room: await Room.get(roomId) 
        };
    }

    // ==========================================
    // CASO COMPLESSO: Orchestrazione nel Service
    // ==========================================

    static async removePlayerFromRoom(roomId, username) {
        const room = await Room.get(roomId);
        if (!room) return { deletedRoom: true };

        await UserService.setUserReady(username, false);

        const client = getRedisClient();
        const playersKey = `room:${roomId}:players`;
        const roomKey = `room:${roomId}`;

        // Loop Optimistic Locking (WATCH)
        while (true) {
            try {
                // 1. WATCH
                await client.watch([playersKey, roomKey]);

                // 2. READ
                const [players, currentHost] = await Promise.all([
                    client.sMembers(playersKey),
                    client.hGet(roomKey, 'host')
                ]);

                const remainingPlayers = players.filter(p => p !== username);
                
                // 3. START MULTI
                const multi = client.multi();

                // Operazioni Base (usiamo i metodi chainable del Model)
                Room.chainRemovePlayer(multi, roomId, username);
                Room.chainClearSocket(multi, roomId, username);

                let deletedRoom = false;
                let hostChanged = false;

                // 4. LOGICA CONDIZIONALE
                if (remainingPlayers.length === 0) {
                    Room.chainDeleteRoom(multi, roomId);
                    deletedRoom = true;
                } else {
                    if (currentHost === username) {
                        const newHost = remainingPlayers[0];
                        Room.chainUpdateHost(multi, roomId, newHost);
                        hostChanged = true;
                    }
                }

                // 5. EXEC
                const results = await multi.exec();

                // Se results è valido, usciamo dal loop
                if (results) {
                    let updatedRoom = null;
                    if (!deletedRoom) {
                        updatedRoom = await Room.get(roomId);
                    }
                    return { updatedRoom, hostChanged, deletedRoom };
                }
                // Se results è null, loopa e riprova (concorrenza rilevata)

            } catch (error) {
                console.error("Transazione removePlayer fallita:", error);
                throw error;
            }
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    static async setAllPlayersInGame(roomId) {
        const players = await Room.getPlayers(roomId);
        if (!players || players.length === 0) return;

        // Update User Statuses
        await UserService.setMultipleUsersStatus(players, UserService.UserStatus.INGAME);
        
        // Update Room Status
        await Room.updateStatus(roomId, RoomStatus.PLAYING);
    }

    static async isUserHost(roomId, username) {
        const host = await Room.getHost(roomId);
        return host === username;
    }

    static async getPlayers(roomId) { return await Room.getPlayers(roomId); }
    static async getRoom(roomId) { return await Room.get(roomId); }
    static async getHost(roomId) { return await Room.getHost(roomId); }
    
    static async checkGameStarted(roomId){ 
        const statusRoom = await Room.getRoomStatus(roomId);
        console.log("Status Room: "+statusRoom)
        return statusRoom===RoomStatus.PLAYING
    }

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
}

module.exports = RoomService;