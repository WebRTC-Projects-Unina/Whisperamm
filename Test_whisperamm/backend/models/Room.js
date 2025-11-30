// models/Room.js
const { getRedisClient } = require('./redis');
const crypto = require('crypto');

// Stati validi per le stanze
const RoomStatus = {
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

class Room {
    /*
     * Crea una nuova stanza in Redis.
     * Ritorna il roomId se successo, null se l'host non esiste.
     */
    static async create(roomId, roomName, hostUsername, maxPlayers, rounds) {
        const client = getRedisClient();
        
        // Verifica che l'host esista
        const hostExists = await client.exists(`user:${hostUsername}`);
        if (!hostExists) {
            return null;
        }
        
        const createdAt = new Date().toISOString();
        const multi = client.multi();
        
        // HASH per dati della stanza
        multi.hSet(`room:${roomId}`, {
            roomId,
            name: roomName,
            host: hostUsername,
            maxPlayers: maxPlayers.toString(),
            rounds: rounds.toString(),
            status: RoomStatus.WAITING,
        });
        
        // Lista di giocatori
        multi.sAdd(`room:${roomId}:players`, hostUsername);
        
        // Indice globale delle stanze attive
        multi.sAdd('rooms:active', roomId);
        
        await multi.exec();
        
        return roomId;
    }
    
    /**
     * Recupera i dati completi di una stanza.
     */
    static async get(roomId) {
        const client = getRedisClient();
        
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
            players,
            currentPlayers: players.length,
        };
    }

    /*
     * Recupera tutte le stanze attive.
     */
    static async getAll() {
        const client = getRedisClient();
        
        const roomIds = await client.sMembers('rooms:active');
        
        if (roomIds.length === 0) {
            return [];
        }
        
        const rooms = await Promise.all(
            roomIds.map(roomId => Room.get(roomId))
        );
        
        return rooms.filter(room => room !== null);
    }
    
    /*
     * Aggiunge un giocatore a una stanza.
     * Ritorna true se successo, false se la stanza non esiste o l'utente non esiste.
     */
    static async addPlayer(roomId, username) {
        const client = getRedisClient();

        // Verifica che l'utente esista
        const userExists = await client.exists(`user:${username}`);
        if (!userExists) {
            return false;
        }

        // Verifica che la stanza esista
        const roomExists = await client.exists(`room:${roomId}`);
        if (!roomExists) {
            return false;
        }
        
        const multi = client.multi();
        
        multi.sAdd(`room:${roomId}:players`, username);
        await multi.exec();
        
        return true;
    }
    
    /*
     * Rimuove un giocatore da una stanza.
     * Ritorna il numero di giocatori rimanenti, o -1 se la stanza non esiste.
     */
    static async removePlayer(roomId, username) {
    
        const client = getRedisClient();
        
        const roomExists = await client.exists(`room:${roomId}`);
        if (!roomExists) {
            console.log(`[Redis Debug] ERRORE: La chiave room:${roomId} non esiste in Redis!`);
            return -1;
        }
    
        // 2. Logghiamo il risultato della cancellazione
        // sRem restituisce: 1 se ha rimosso, 0 se l'utente non c'era
        await client.sRem(`room:${roomId}:players`, username);
        
        
        // 3. Logghiamo cosa è rimasto
        const remainingPlayers = await client.sMembers(`room:${roomId}:players`);


        return remainingPlayers; // Ritorna un ARRAY di stringhe ['Marco', 'Luca']
    }
    
    /*
     * Aggiorna lo status di una stanza.
     */
    static async updateStatus(roomId, newStatus) {
        const client = getRedisClient();
        
        const exists = await client.exists(`room:${roomId}`);
        if (!exists) {
            return false;
        }
        
        const multi = client.multi();
        multi.hSet(`room:${roomId}`, 'status', newStatus);
        multi.hSet(`room:${roomId}`, 'updatedAt', new Date().toISOString());
        
        await multi.exec();
        return true;
    }

    /*
     * Link la Room col Game, durante la transazione della creazione del game.
     * e passa la room allo stato playing!
     */
    static linkToGame(multi, roomId,gameId){
        multi.hSet(`room:${roomId}`, { 
            gameId: gameId,
            status: 'playing' 
        });
    }

    /*
     * Aggiorna l'host di una stanza.
     */
    static async updateHost(roomId, newHostUsername) {
        const client = getRedisClient();
        
        const exists = await client.exists(`room:${roomId}`);
        if (!exists) {
            return false;
        }
        
        client.hSet(`room:${roomId}`, 'host', newHostUsername);

        return true;
    }
    
    /*
     * Elimina una stanza.
     */
    static async delete(roomId) {
        const client = getRedisClient();
        
        const multi = client.multi();
        
        multi.del(`room:${roomId}`);
        multi.del(`room:${roomId}:players`);
        multi.sRem('rooms:active', roomId);
        
        const results = await multi.exec();
        
        return results.some(result => result > 0);
    }
    
    /*
     * Verifica se una stanza esiste.
     */
    static async exists(roomId) {
        const client = getRedisClient();
        return await client.exists(`room:${roomId}`) === 1;
    }
    
    /*
     * Recupera i giocatori di una stanza.
     */
    static async getPlayers(roomId) {
        const client = getRedisClient();
        return await client.sMembers(`room:${roomId}:players`);
    }

    /*
     * Verifica se un utente è nella stanza.
     */
    static async isPlayerInRoom(roomId, username) {
        const client = getRedisClient();
        return await client.sIsMember(`room:${roomId}:players`, username);
    }

    /*
     * Conta i giocatori in una stanza.
     */
    static async countPlayers(roomId) {
        const client = getRedisClient();
        return await client.sCard(`room:${roomId}:players`);
    }


    // -- GESTIONE LEAVED
    static async moveToLeaved(roomId,username){
        const client = getRedisClient();
        client.sAdd(`room:${roomId}:leaved`, username);
    }


    // -- GESTIONE DELLE SOCKET -- 27/11/2025 - suso
    //Imposta il socket per un utente.
    static async setSocket(roomId, username, socketId) {
        const client = getRedisClient();
        return await client.hSet(`room:${roomId}:sockets`, username, socketId);
    }

    /*
     * Recupera il socket di un utente.
     */
    static async getSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hGet(`room:${roomId}:sockets`, username);
    }

    //Elimina il socket di un utente.
    static async deleteSocket(roomId, username) {
        const client = getRedisClient();
        return await client.hDel(`room:${roomId}:sockets`, username);
    }
    
    // Imposta il socket di un utente a stringa vuota (null) mantenendo lo username nella mappa
    static async clearSocket(roomId, username) {
        const client = getRedisClient();
        // Usiamo hSet invece di hDel per sovrascrivere il valore
        // Nota: Redis non accetta 'null' puro, usiamo stringa vuota ''
        return await client.hSet(`room:${roomId}:sockets`, username, '');
    }

    //Recupera tutti i socket della stanza.
    static async getAllSockets(roomId) {
        const client = getRedisClient();
        return await client.hGetAll(`room:${roomId}:sockets`);
    }

    //Elimina tutti i socket della stanza.
    static async deleteAllSockets(roomId) {
        const client = getRedisClient();
        return await client.del(`room:${roomId}:sockets`);
    }
}

module.exports = { Room, RoomStatus };