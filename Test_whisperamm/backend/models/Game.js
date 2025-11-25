// src/models/Game.js
const { getRedisClient } = require('./redis'); 

// Questo enum serve al Service, lo lasciamo esportato qui per comodità
const GamePhase = {
    DICE: 'lancio_dadi', 
    TURN_ASSIGNMENT: 'ordine_gioco', 
    ROLE_ASSIGNMENT: 'assegnazione_parola_e_ruoli', 
    GAME: 'inizio_gioco',
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

        await multi.exec();
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

    // Aggiorna un singolo campo nei metadati, utile per cambi di fase, round, ecc.
    static async updateMetaField(gameId, field, value) {
        const client = getRedisClient();
        await client.hSet(`game:${gameId}`, field, value);
    }
    
    
    //Update  i dati di un giocatore, e riceve già la stringa JSON pronta
    static async savePlayerRaw(gameId, username, playerJsonString) {
        const client = getRedisClient();
        await client.hSet(`game:${gameId}:players`, username, playerJsonString);
    }
    

    //READ dei dati grezzi di un singolo giocatore, che verrano poi parsati dal Service. 
    static async getPlayerRaw(gameId, username) {
        const client = getRedisClient();
        return await client.hGet(`game:${gameId}:players`, username);
    }

}

module.exports = { Game, GamePhase };