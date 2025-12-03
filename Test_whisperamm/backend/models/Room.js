// models/Room.js
const { getRedisClient } = require('./redis');

const RoomStatus = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

class Room {

    /**
     * Recupera SOLO l'host della stanza.
     */
    static async getHost(roomId) {
        const client = getRedisClient();
        // HGET è molto più leggero di HGETALL
        return await client.hGet(`room:${roomId}`, 'host');
    }

    /**
     * Recupera i dati completi di una stanza.
     */
    static async get(roomId) {
        const client = getRedisClient();
        
        // Parallelizziamo le richieste
        const [roomData, players] = await Promise.all([
            client.hGetAll(`room:${roomId}`),
            client.sMembers(`room:${roomId}:players`)
        ]);
        
        if (!roomData || !roomData.roomId) {
            return null;
        }
        
        return {
            roomId: roomData.roomId,
            name: roomData.name,
            host: roomData.host,
            maxPlayers: parseInt(roomData.maxPlayers),
            rounds: parseInt(roomData.rounds),
            status: roomData.status,
            players, // Array di stringhe
            currentPlayers: players.length,
        };
    }

    // --- SCRITTURA / GESTIONE ---

    static async create(roomId, roomName, hostUsername, maxPlayers, rounds) {
        const client = getRedisClient();
        
        // Check esistenza user (opzionale se garantito dal service, ma sicuro qui)
        const hostExists = await client.exists(`user:${hostUsername}`);
        if (!hostExists) return null;
        
        const multi = client.multi();
        
        // Set dati stanza
        multi.hSet(`room:${roomId}`, {
            roomId,
            name: roomName,
            host: hostUsername,
            maxPlayers: maxPlayers.toString(),
            rounds: rounds.toString(),
            status: RoomStatus.WAITING,
        });
        
        // Aggiungi host ai players
        multi.sAdd(`room:${roomId}:players`, hostUsername);
        
        // Aggiungi all'indice stanze attive
        multi.sAdd('rooms:active', roomId);
        
        await multi.exec();
        return roomId;
    }

    static async addPlayer(roomId, username) {
        const client = getRedisClient();

        // Validazioni veloci
        const [userExists, roomExists] = await Promise.all([
            client.exists(`user:${username}`),
            client.exists(`room:${roomId}`)
        ]);

        if (!userExists || !roomExists) return false;
        
        // Aggiunta atomica
        await client.sAdd(`room:${roomId}:players`, username);
        return true;
    }
    
    /**
     * Rimuove player e restituisce la lista aggiornata in un colpo solo.
     */
    static async removePlayer(roomId, username) {
        const client = getRedisClient();
        
        const roomExists = await client.exists(`room:${roomId}`);
        if (!roomExists) return null; // O gestisci come errore nel service
    
        const multi = client.multi();
        
        // 1. Rimuovi
        multi.sRem(`room:${roomId}:players`, username);
        // 2. Leggi i rimanenti (nella stessa transazione)
        multi.sMembers(`room:${roomId}:players`);
        
        const results = await multi.exec();
        
        // results[0] è il risultato di sRem (1 o 0)
        // results[1] è il risultato di sMembers (Array)
        return results[1]; 
    }

    // --- UTILITIES & SOCKETS ---

    static async updateHost(roomId, newHostUsername) {
        const client = getRedisClient();
        // HSET sovrascrive il campo specifico senza toccare il resto
        const result = await client.hSet(`room:${roomId}`, 'host', newHostUsername);
        return result; 
    }

    static async updateStatus(roomId, newStatus) {
        const client = getRedisClient();
        const multi = client.multi();
        multi.hSet(`room:${roomId}`, 'status', newStatus);
        await multi.exec();
        return true;
    }

    static linkToGame(multi, roomId, gameId){
        // Questa funzione aspetta un oggetto 'multi' (transaction) dall'esterno
        multi.hSet(`room:${roomId}`, { 
            gameId: gameId,
            status: RoomStatus.PLAYING 
        });
    }

    static async delete(roomId) {
        const client = getRedisClient();
        const multi = client.multi();
        
        multi.del(`room:${roomId}`);
        multi.del(`room:${roomId}:players`);
        multi.del(`room:${roomId}:sockets`); // Puliamo anche i socket
        multi.del(`room:${roomId}:leaved`);  // Puliamo la history
        multi.sRem('rooms:active', roomId);
        
        const results = await multi.exec();
        return results.some(r => r > 0);
    }

    // --- GETTERS DI SUPPORTO ---

    static async getAll() {
        const client = getRedisClient();
        const roomIds = await client.sMembers('rooms:active');
        if (roomIds.length === 0) return [];
        
        // Attenzione: N+1 query. Accettabile per < 100 stanze. 
        // Per scalare servirebbe un pattern diverso o pipeline complessa.
        const rooms = await Promise.all(roomIds.map(id => Room.get(id)));
        return rooms.filter(r => r !== null);
    }

    static async getPlayers(roomId) {
        const client = getRedisClient();
        return await client.sMembers(`room:${roomId}:players`);
    }

    static async isPlayerInRoom(roomId, username) {
        const client = getRedisClient();
        return await client.sIsMember(`room:${roomId}:players`, username);
    }

    static async countPlayers(roomId) {
        const client = getRedisClient();
        return await client.sCard(`room:${roomId}:players`);
    }
    
    static async moveToLeaved(roomId, username){
        const client = getRedisClient();
        await client.sAdd(`room:${roomId}:leaved`, username);
    }

    // --- SOCKET MANAGEMENT ---
    static async setSocket(roomId, username, socketId) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}:sockets`, username, socketId);
    }

    static async getSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}:sockets`, username);
    }

    static async deleteSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hDel(`room:${roomId}:sockets`, username);
    }
    
    static async clearSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}:sockets`, username, '');
    }

    static async getAllSockets(roomId) {
        const client = getRedisClient();
        return await client.hGetAll(`room:${roomId}:sockets`);
    }

    static async deleteAllSockets(roomId) {
        const client = getRedisClient();
        return await client.del(`room:${roomId}:sockets`);
    }
}

module.exports = { Room, RoomStatus };