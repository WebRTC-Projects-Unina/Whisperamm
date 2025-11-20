const { getRedisClient } = require('../config_redis/redis');
const crypto = require('crypto');

// Stati validi per le stanze
const RoomStatus = {
    WAITING: 'waiting',    // In attesa di giocatori
    PLAYING: 'playing',    // Partita in corso
    FINISHED: 'finished'   // Partita terminata
};

class Room {
    /**
     * Crea una nuova stanza e la salva in Redis.
     * @param {string} roomName - Il nome visualizzato della stanza.
     * @param {string} hostUsername - Lo username dell'host.
     * @param {number} maxPlayers - Numero massimo di giocatori.
     * @param {number} rounds - Numero di round della partita.
     * @returns {string} L'ID della stanza appena creata.
     */
    static async create(roomName, hostUsername, maxPlayers = 4, rounds = 5) {
        const client = getRedisClient();
        
        // Genera un ID univoco di 6 caratteri
        const roomId = crypto.randomUUID().slice(0, 6).toUpperCase();
        
        // Verifica che l'host esista
        const hostExists = await client.exists(`user:${hostUsername}`);
        if (!hostExists) {
            throw new Error('Host non trovato');
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
            createdAt,
            updatedAt: createdAt
        });
        
        //E' più efficiente creare la lista di giocatori esterna all'hash
        multi.sAdd(`room:${roomId}:players`, hostUsername);
        // Aggiungere la stanza all'indice globale delle stanze attive
        multi.sAdd('rooms:active', roomId);
        
        await multi.exec();

        console.log("Room creata in Redis")
        
        return roomId;
    }
    
    /**
     * Recupera i dati completi di una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @returns {object|null} L'oggetto stanza o null se non esiste.
     */
    static async get(roomId) {
        const client = getRedisClient();
        
        // Recupera i dati della stanza e la lista giocatori in parallelo
        const [roomData, players] = await Promise.all([
            client.hGetAll(`room:${roomId}`),
            client.sMembers(`room:${roomId}:players`)
        ]);
        
        // Se la stanza non esiste
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
            createdAt: roomData.createdAt,
            updatedAt: roomData.updatedAt
        };
    }

    // Recupera il numero di giocatori in una stanza.
    static async getNumberOfPlayers(roomId) {
        const client = getRedisClient();
        const number = await client.sCard(`room:${roomId}:players`);
        console.log(number);
        return number;
    }

    // Recupera il numero massimo di giocatori consentiti in una stanza.
    static async getMaxPlayers(roomId) {
        const client = getRedisClient();
        const maxPlayers = await client.hGet(`room:${roomId}`, 'maxPlayers');
        return parseInt(maxPlayers);
    }


    /**
     * Recupera tutte le stanze attive.
     * @returns {Array<object>} Array di oggetti stanza.
     */
    static async getAll() {
        const client = getRedisClient();
        
        // Recupera tutti gli ID delle stanze attive
        const roomIds = await client.sMembers('rooms:active');
        
        if (roomIds.length === 0) {
            return [];
        }
        
        // Recupera i dati di tutte le stanze in parallelo
        const rooms = await Promise.all(
            roomIds.map(roomId => Room.get(roomId))
        );
        
        // Filtra eventuali null (stanze che non esistono più)
        return rooms.filter(room => room !== null);
    }
    
    /**
     * Aggiunge un giocatore a una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @param {string} username - Lo username del giocatore.
     * @returns {object} La stanza aggiornata.
     */
    static async addPlayer(roomId, username) {
        const client = getRedisClient();

        const room = await Room.get(roomId);
        if(!room){  
            throw new Error('Stanza non trovata');
        }

        // Verifica che l'utente esista
        const userExists = await client.exists(`user:${username}`);
        if (!userExists) {
            throw new Error('Utente non trovato');
        }
        
        // Verifica che la stanza non sia piena
        //mget per prendere più valori contemporaneamente
        /*const [currentPlayers, maxPlayers, status] = await client.hmGet(
            `room:${roomId}`,
            ['maxPlayers', 'status']
        );*/
        
        const playersCount = await client.sCard(`room:${roomId}:players`);
        
        if (playersCount >= parseInt(room.maxPlayers)) {
            throw new Error('Stanza piena');
        }
        
        if (room.status !== RoomStatus.WAITING) {
            throw new Error('La partita è già iniziata');
        }
        
        const multi = client.multi();
        
        // Aggiungi il giocatore al SET
        multi.sAdd(`room:${roomId}:players`, username);
        
        // Aggiorna il timestamp
        multi.hSet(`room:${roomId}`, 'updatedAt', new Date().toISOString());
        
        await multi.exec();
        
        return await Room.get(roomId);
    }
    
    /**
     * Rimuove un giocatore da una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @param {string} username - Lo username del giocatore.
     * @returns {object|null} La stanza aggiornata o null se è stata eliminata.
     */
    static async removePlayer(roomId, username) {
        const client = getRedisClient();
        
        const room = await Room.get(roomId);
        if (!room) {
            return null;
        }
        
        // Rimuovi il giocatore
        await client.sRem(`room:${roomId}:players`, username);
        
        // Recupera i giocatori rimanenti
        const remainingPlayers = await client.sMembers(`room:${roomId}:players`);
        
        // Se la stanza è vuota, eliminala
        if (remainingPlayers.length === 0) {
            await Room.delete(roomId);
            return null;
        }
        
        // Se l'host ha lasciato, nomina un nuovo host
        if (room.host === username) {
            await client.hSet(`room:${roomId}`, 'host', remainingPlayers[0]);
        }
        
        // Aggiorna il timestamp
        await client.hSet(`room:${roomId}`, 'updatedAt', new Date().toISOString());
        
        return await Room.get(roomId);
    }
    
    /**
     * Aggiorna lo status di una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @param {string} newStatus - Il nuovo status (da RoomStatus).
     */
    static async updateStatus(roomId, newStatus) {
        const client = getRedisClient();
        
        const exists = await client.exists(`room:${roomId}`);
        if (!exists) {
            throw new Error('Stanza non trovata');
        }
        
        if (!Object.values(RoomStatus).includes(newStatus)) {
            throw new Error('Status non valido');
        }
        
        const multi = client.multi();
        multi.hSet(`room:${roomId}`, 'status', newStatus);
        multi.hSet(`room:${roomId}`, 'updatedAt', new Date().toISOString());
        
        await multi.exec();
    }
    
    /**
     * Aggiorna l'host di una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @param {string} newHostUsername - Il nuovo host.
     */
    static async updateHost(roomId, newHostUsername) {
        const client = getRedisClient();
        
        const room = await Room.get(roomId);
        if (!room) {
            throw new Error('Stanza non trovata');
        }
        
        // Verifica che il nuovo host sia nella stanza
        if (!room.players.includes(newHostUsername)) {
            throw new Error('Il nuovo host deve essere un giocatore della stanza');
        }
        
        const multi = client.multi();
        multi.hSet(`room:${roomId}`, 'host', newHostUsername);
        multi.hSet(`room:${roomId}`, 'updatedAt', new Date().toISOString());
        
        await multi.exec();
    }
    
    /**
     * Elimina una stanza.
     * @param {string} roomId - L'ID della stanza da eliminare.
     * @returns {boolean} True se l'eliminazione ha avuto successo.
     */
    static async delete(roomId) {
        const client = getRedisClient();
        
        const multi = client.multi();
        
        // Elimina l'hash della stanza
        multi.del(`room:${roomId}`);
        
        // Elimina il SET dei giocatori
        multi.del(`room:${roomId}:players`);
        
        // Rimuovi dagli indici globali
        multi.sRem('rooms:active', roomId);
        multi.zRem('rooms:by_creation', roomId);
        
        const results = await multi.exec();
        
        // Verifica se almeno una chiave è stata eliminata
        return results.some(result => result > 0);
    }
    
    /**
     * Verifica se una stanza esiste.
     * @param {string} roomId - L'ID della stanza.
     * @returns {boolean} True se esiste, false altrimenti.
     */
    static async exists(roomId) {
        const client = getRedisClient();
        return await client.exists(`room:${roomId}`) === 1;
    }
    
    /**
     * Recupera i giocatori di una stanza.
     * @param {string} roomId - L'ID della stanza.
     * @returns {Array<string>} Array di username.
     */
    static async getPlayers(roomId) {
        const client = getRedisClient();
        return await client.sMembers(`room:${roomId}:players`);
    }
}

module.exports = { Room, RoomStatus };