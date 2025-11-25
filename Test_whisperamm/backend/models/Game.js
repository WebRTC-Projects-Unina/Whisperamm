const { getRedisClient } = require('../config_redis/redis');
const crypto = require('crypto');

// Definiamo gli stati qui o in un file constants, per ora li teniamo qui
const GameStatus = {
    DICE_ROLLING: 'lancio_dadi',
    ORDER: 'ordine_gioco',
    ASSIGNMENT: 'assegnazione_parola_e_ruoli',
    GAME: 'inizio_gioco',
    FINISHED: 'finita'
};

class Game {

    /**
     * Crea la struttura dati su Redis
     */
    static async create(roomId, playersList) {
        const client = getRedisClient();
        const gameId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const multi = client.multi();

        // 1. Metadati Partita
        multi.hSet(`game:${gameId}`, {
            gameId,
            roomId,
            status: GameStatus.DICE_ROLLING,
            createdAt,
            updatedAt: createdAt,
            round: 1
        });

        // 2. Setup Giocatori
        // Salviamo ogni giocatore come chiave nella hash :players
        // Valore: JSON stringify dello stato del giocatore
        if (playersList && playersList.length > 0) {
            const playersMap = {};
            for (const username of playersList) {
                playersMap[username] = JSON.stringify({
                    username,
                    role: null,
                    order: null,    // Ordine di turno (1, 2, 3...)
                    dice: null,     // Risultato dadi es: [4, 6]
                    muted: false,
                    isReady: false
                });
            }
            multi.hSet(`game:${gameId}:players`, playersMap);
        }

        // 3. Indici
        multi.sAdd('games:active', gameId);
        multi.sAdd(`games:by_room:${roomId}`, gameId);

        await multi.exec();
        return gameId;
    }

    /**
     * Ritorna l'oggetto completo del gioco + array giocatori
     */
    static async findById(gameId) {
        const client = getRedisClient();
        
        // Parallelizziamo le chiamate
        const [meta, playersHash] = await Promise.all([
            client.hGetAll(`game:${gameId}`),
            client.hGetAll(`game:${gameId}:players`)
        ]);

        if (!meta || !meta.gameId) return null;

        // Deserializza i giocatori
        const players = [];
        if (playersHash) {
            for (const jsonStr of Object.values(playersHash)) {
                try {
                    players.push(JSON.parse(jsonStr));
                } catch (e) { console.error("Errore parse player", e); }
            }
        }

        return { ...meta, players };
    }

    /**
     * Aggiorna un campo specifico nei metadati del gioco
     */
    static async updateMeta(gameId, field, value) {
        const client = getRedisClient();
        await client.hSet(`game:${gameId}`, field, value);
        await client.hSet(`game:${gameId}`, 'updatedAt', new Date().toISOString());
    }

    /**
     * Aggiorna lo stato di un singolo giocatore
     */
    static async updatePlayer(gameId, username, dataObject) {
        const client = getRedisClient();
        // Recuperiamo prima i dati attuali per fare merge (opzionale ma sicuro)
        // O sovrascriviamo se siamo sicuri. Qui facciamo merge.
        const currentRaw = await client.hGet(`game:${gameId}:players`, username);
        let current = currentRaw ? JSON.parse(currentRaw) : {};

        const updated = { ...current, ...dataObject };
        
        await client.hSet(`game:${gameId}:players`, username, JSON.stringify(updated));
        return updated;
    }

    /**
     * Elimina partita
     */
    static async delete(gameId) {
        const client = getRedisClient();
        const meta = await client.hGetAll(`game:${gameId}`);
        if(!meta) return;

        const multi = client.multi();
        multi.del(`game:${gameId}`);
        multi.del(`game:${gameId}:players`);
        multi.sRem('games:active', gameId);
        if(meta.roomId) multi.sRem(`games:by_room:${meta.roomId}`, gameId);
        
        await multi.exec();
    }
}

module.exports = { Game, GameStatus };