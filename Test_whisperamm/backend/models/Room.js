// models/Room.js
const { getRedisClient } = require('./redis');

const RoomStatus = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

class Room {

    // ==========================================
    // METODI DI LETTURA
    // ==========================================

    static async getHost(roomId) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}`, 'host');
    }

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
            gameId: roomData.gameId, // Importante restituirlo se c'è
            players,
            currentPlayers: players.length,
        };
    }

    static async getPlayers(roomId) {
        const client = getRedisClient();
        return await client.sMembers(`room:${roomId}:players`);
    }

    static async isPlayerInRoom(roomId, username) {
        const client = getRedisClient();
        return await client.sIsMember(`room:${roomId}:players`, username);
    }

    static async getSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}:sockets`, username);
    }

    /**
     * Controlla se l'utente ha una voce nella mappa socket (anche vuota).
     * Serve per capire se è un Rejoin.
     */
    static async hasSocketHistory(roomId, username) {
        const client = getRedisClient();
        return await client.hExists(`room:${roomId}:sockets`, username);
    }

    // ==========================================
    // TRANSAZIONI E OPERAZIONI SU CHAIN
    // ==========================================

    /**
     * Usato da Game.create per linkare Room e Game atomicamente.
     */
    static linkToGame(chain, roomId, gameId) {
        chain.hSet(`room:${roomId}`, {
            gameId: gameId,
            status: RoomStatus.PLAYING
        });
    }

    /**
     * Esegue la transazione di ingresso completa
     */
    static async joinTransaction(roomId, username, socketId) {
        const client = getRedisClient();
        const multi = client.multi();

        // 1. Aggiungi a Players
        multi.sAdd(`room:${roomId}:players`, username);
        // 2. Salva/Aggiorna Socket
        multi.hSet(`room:${roomId}:sockets`, username, socketId);

        return await multi.exec();
    }

    /**
     * Esegue la transazione di uscita (Soft Delete per Rejoin)
     */
    static async leaveTransaction(roomId, username) {
        const client = getRedisClient();
        const multi = client.multi();

        // 1. Rimuovi da Players (così sAdd ritornerà 1 se rientra)
        multi.sRem(`room:${roomId}:players`, username);
        // 2. Setta Socket a vuoto (ma mantieni la chiave per history)
        multi.hSet(`room:${roomId}:sockets`, username, ''); 
        // 3. Leggi chi resta
        multi.sMembers(`room:${roomId}:players`);

        return await multi.exec();
    }

    // ==========================================
    // METODI DI SCRITTURA STANDARD
    // ==========================================

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

    static async updateHost(roomId, newHostUsername) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}`, 'host', newHostUsername);
    }

    static async updateStatus(roomId, newStatus) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}`, 'status', newStatus);
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

    static async deleteAllSockets(roomId) {
        const client = getRedisClient();
        return await client.del(`room:${roomId}:sockets`);
    }
}

module.exports = { Room, RoomStatus };