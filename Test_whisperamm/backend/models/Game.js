// src/models/Game.js
const { getRedisClient } = require('./redis'); 

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

        // Salvataggio Metadati (Piatto)
        // Redis v4 accetta oggetti JS direttamente se i valori sono stringhe/numeri
        multi.hSet(`game:${gameId}`, metaData);

        // Salvataggio Giocatori (Mappa di stringhe JSON)
        if (playersMap && Object.keys(playersMap).length > 0){
            multi.hSet(`game:${gameId}:players`, playersMap);
        }

        // Salvataggio del Puntatore: RoomID -> GameID
        // Senza questa riga, Redis non sa che in questa stanza c'è questa partita.
        if (metaData.roomId) {
            // Nota: uso .set perchè è una stringa semplice, non un hash
            multi.set(`room:${metaData.roomId}:gameId`, gameId);
        }

        await multi.exec();
        console.log(`[Game] Partita ${gameId} creata in room ${metaData.roomId}`);
        return gameId;
    }

    // READ: Recupera i dati grezzi, intesi nel json che torna, che non ce ne fotte dato che lo sistema il service.
    static async findByIdRaw(gameId) {
        const client = getRedisClient();
        
        const [meta, playersHash] = await Promise.all([
            client.hGetAll(`game:${gameId}`),
            client.hGetAll(`game:${gameId}:players`)
        ]);

        // Se non c'è meta, la partita non esiste
        if (!meta || Object.keys(meta).length === 0) return null;

        return { meta, playersHash };
    }

    static async findGameIdByRoomId(roomId) {
        const client = getRedisClient();
        const gameId = await client.get(`room:${roomId}:gameId`);
        return gameId;
    }

    // Aggiorna un singolo campo nei metadati, utile per cambi di fase, round, ecc.
    static async updateMetaField(gameId, field, value) {
        const client = getRedisClient();
        await client.hSet(`game:${gameId}`, field, value);
    }
    

}

module.exports = { Game, GamePhase };