// src/models/Game.js
const { getRedisClient } = require('./redis'); 
const {Room} = require('./Room')

// Questo enum serve al Service, lo lasciamo esportato qui per comodità
const GamePhase = {
    DICE: 'lancio_dadi', 
    TURN_ASSIGNMENT: 'ordine_gioco',
    GAME: 'inizio_gioco',
    DISCUSSION: 'discussione',
    VOTING: 'votazione',
    RESULTS: 'risultati',
    FINISH: 'finita'
};

class Game {

    /**
     * CREATE: Salva i dati su Redis.
     * @param {string} gameId 
     * @param {object} metaData - Oggetto piatto (valori stringhe/numeri)
     * @param {object} playersMap - Oggetto { "username": "JSON_String" }
     */
    static async create(gameId, metaData, playersMap) {
        const client = getRedisClient();
        const multi = client.multi();

        // 1. Salvataggio Metadati (Piatto)
        // Redis v4 accetta oggetti JS direttamente se i valori sono stringhe/numeri
        multi.hSet(`game:${gameId}`, metaData);

        // 2.Salvataggio Giocatori (Mappa di stringhe JSON)
        if (playersMap && Object.keys(playersMap).length > 0){
            multi.hSet(`game:${gameId}:players`, playersMap);
        }

        // 3. Linking: aggiorniamo la Room esistente, (Hash room:id)
        // Non modifico direttamente qui perchè il modello di Game non dovrebbe sapere
        // di Room, stiamo usando MVC.. dunque deleghiamo Room 
        // dato che comunque deve essere terminata la transazione, passandogli l'oggetto multi!
        if (metaData.roomId) {
            await Room.linkToGame(multi,metaData.roomId,gameId)
        }

        await multi.exec();

        return gameId;
    }

    // READ: Recupera i dati grezzi
    // Ovvero, qui viene restituito al service metadati (oggetto) e playerhash che è un json
    static async getGame(gameId) {
        const client = getRedisClient();
        
        const [meta, playersHash] = await Promise.all([
            client.hGetAll(`game:${gameId}`),
            client.hGetAll(`game:${gameId}:players`)
        ]);

        // Se non c'è meta, la partita non esiste
        if (!meta || Object.keys(meta).length === 0) return null;

        return { meta, playersHash }; //Ciò che ci interessa di game.
    }

    static async findGameIdByRoomId(roomId) {
       
        const client = getRedisClient();
        const gameId = await client.hGet(`room:${roomId}`, 'gameId');
       
        return gameId;
    }

    static async findRoomIdByGameId(gameId) {
        const client = getRedisClient();
        const roomId = await client.hGet(`game:${gameId}`, 'roomId');
        return roomId;
    }
    // Aggiorna un singolo campo nei metadati, utile per cambi di fase, round, ecc.
    static async updateMetaField(gameId, field, value) {
        const client = getRedisClient();
        await client.hSet(`game:${gameId}`, field, value);
    }

    // Get solo della chiave dei giocatori
    static async getPlayers(gameId) {
        const client = getRedisClient();
        return await client.hGetAll(`game:${gameId}:players`);
    }
    
    /**
     * Incrementa un valore numerico nei metadati in modo ATOMICO (HINCRBY).
     * Restituisce il nuovo valore dopo l'incremento.
     */
    static async incrementMetaField(gameId, field, amount = 1) {
        const client = getRedisClient();
        // Redis HINCRBY: incrementa il campo hash del valore specificato
        // Restituisce il nuovo valore intero.
        return await client.hIncrBy(`game:${gameId}`, field, amount);
    }
}

module.exports = { Game, GamePhase };