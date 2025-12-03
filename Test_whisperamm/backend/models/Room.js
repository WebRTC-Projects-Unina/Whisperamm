// models/Room.js
const { getRedisClient } = require('./redis');

const RoomStatus = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

class Room {

    // ==========================================
    // 1. METODI DI LETTURA
    // ==========================================

    static async get(roomId) {
        const client = getRedisClient();
        const [roomData, players] = await Promise.all([
            client.hGetAll(`room:${roomId}`),
            client.sMembers(`room:${roomId}:players`)
        ]);
        
        if (!roomData || !roomData.roomId) return null;
        
        return {
            roomId: roomData.roomId,
            name: roomData.name,
            host: roomData.host,
            maxPlayers: parseInt(roomData.maxPlayers),
            rounds: parseInt(roomData.rounds),
            status: roomData.status,
            gameId: roomData.gameId,
            players,
            currentPlayers: players.length,
        };
    }

    static async getPlayers(roomId) {
        const client = getRedisClient();
        return await client.sMembers(`room:${roomId}:players`);
    }

    static async getHost(roomId) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}`, 'host');
    }
  

    static async getRoomStatus(roomId){
        const client = getRedisClient()
        return await client.hget(`room:${roomId}`, 'status')
    }

    // Metodo fondamentale per checkRoom
    static async isPlayerInRoom(roomId, username) {
        const client = getRedisClient();
        return await client.sIsMember(`room:${roomId}:players`, username);
    }

    // Metodo fondamentale per Rejoin Check
    static async hasSocketHistory(roomId, username) {
        const client = getRedisClient();
        return await client.hExists(`room:${roomId}:sockets`, username);
    }
    
    // Serve per l'helper nel socket service
    static async getSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}:sockets`, username);
    }
    
    static async deleteAllSockets(roomId) {
        const client = getRedisClient();
        return await client.del(`room:${roomId}:sockets`);
    }

    // ==========================================
    // 2. METODI ATOMICI AUTONOMI (Il Service li chiama direttamente)
    // ==========================================

    /**
     * Crea la stanza. Transazione interna.
     */
    static async create(roomId, roomName, hostUsername, maxPlayers, rounds) {
        const client = getRedisClient();
        
        const hostExists = await client.exists(`user:${hostUsername}`);
        if (!hostExists) return null;
        
        const multi = client.multi();
        multi.hSet(`room:${roomId}`, {
            roomId,
            name: roomName,
            host: hostUsername,
            maxPlayers: maxPlayers.toString(),
            rounds: rounds.toString(),
            status: RoomStatus.WAITING,
        });
        multi.sAdd(`room:${roomId}:players`, hostUsername);
        multi.sAdd('rooms:active', roomId);
        
        await multi.exec();
        return roomId;
    }

    /**
     * Aggiunge utente e socket. Transazione interna semplice.
     */
    static async joinTransaction(roomId, username, socketId) {
        const client = getRedisClient();
        const multi = client.multi();

        multi.sAdd(`room:${roomId}:players`, username);
        multi.hSet(`room:${roomId}:sockets`, username, socketId);

        return await multi.exec();
    }
    
    static async updateStatus(roomId, status) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}`, 'status', status);
    }
    
    static async updateHost(roomId, newHost) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}`, 'host', newHost);
    }

    static async delete(roomId) {
        const client = getRedisClient();
        const multi = client.multi();
        multi.del(`room:${roomId}`);
        multi.del(`room:${roomId}:players`);
        multi.del(`room:${roomId}:sockets`);
        multi.del(`room:${roomId}:leaved`);
        multi.sRem('rooms:active', roomId);
        const results = await multi.exec();
        return results.some(r => r > 0);
    }

    // ==========================================
    // 3. METODI "CHAINABLE" (Per Orchestrazione Service & Game Model)
    // ==========================================
    // Questi metodi ACCETTANO 'chain' (multi) e NON fanno exec.

    static chainRemovePlayer(chain, roomId, username) {
        chain.sRem(`room:${roomId}:players`, username);
    }

    static chainClearSocket(chain, roomId, username) {
        chain.hSet(`room:${roomId}:sockets`, username, '');
    }

    static chainUpdateHost(chain, roomId, newHostUsername) {
        chain.hSet(`room:${roomId}`, 'host', newHostUsername);
    }

    static chainDeleteRoom(chain, roomId) {
        chain.del(`room:${roomId}`);
        chain.del(`room:${roomId}:players`);
        chain.del(`room:${roomId}:sockets`);
        chain.del(`room:${roomId}:leaved`);
        chain.sRem('rooms:active', roomId);
    }

    /**
     * IMPORTANTE: Nome ripristinato a 'linkToGame' perché Game.js lo chiama così.
     * Accetta una chain/multi da Game.create.
     */
    static linkToGame(chain, roomId, gameId) {
        chain.hSet(`room:${roomId}`, {
            gameId: gameId,
            status: RoomStatus.PLAYING
        });
    }
}

module.exports = { Room, RoomStatus };