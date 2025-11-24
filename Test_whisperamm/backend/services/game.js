const { getRedisClient } = require('../config_redis/redis');
const crypto = require('crypto');

// Stati possibili per una partita
const GameStatus = {
    DICE_ROLLING: 'lancio_dadi',
    ORDER: 'ordine_gioco',
    ASSIGNMENT: 'assegnazione_parola_e_ruoli',
    GAME: 'inizio_gioco',
    FINISHED: 'finita'
};

class Game {

    /**
     * Crea una nuova partita associata a `roomId`.
     * - `gameId` è la chiave primaria (UUID completo per evitare collisioni)
     * - mantiene un indice secondario: `games:by_room:<roomId>`
     * @param {string} roomId
     * @returns {string} gameId
     */
    static async create(roomId, meta = {}) {
        const client = getRedisClient();

        // Verifica che la stanza esista
        const roomExists = await client.exists(`room:${roomId}`);
        if (!roomExists) {
            throw new Error('Room non trovata');
        }

        // Preleva i giocatori dalla stanza (set)
        const playersInRoom = await client.sMembers(`room:${roomId}:players`);

        const gameId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const multi = client.multi();

        // Salviamo i metadati della partita (meta è serializzato)
        multi.hSet(`game:${gameId}`, {
            gameId,
            roomId,
            status: GameStatus.DICE_ROLLING,
            count_rounds:
            createdAt,
            updatedAt: createdAt,
        });

        // Se ci sono giocatori nella stanza, copiali nella hash dei players della partita
        // dove ogni campo è lo username e il valore è un JSON con proprietà iniziali
        // { role: null, order: null, muted: false }
        if (playersInRoom && playersInRoom.length > 0) {
            const playersMap = {};
            for (const username of playersInRoom) {
                playersMap[username] = JSON.stringify({ role: null, order: null, muted: false });
            }
            multi.hSet(`game:${gameId}:players`, playersMap);
        }

        // Aggiungere il gioco all'indice globale delle stanze attive
        multi.sAdd('games:active', gameId);
        // 
        multi.sAdd(`games:by_room:${roomId}`, gameId);

        await multi.exec();

        return gameId;
    }

    /**
     * Recupera i dati di una partita
     * @param {string} gameId
     * @returns {object|null}
     */
    static async get(gameId) {
        const client = getRedisClient();
        // Recupera hash della partita e la hash dei giocatori in parallelo
        const [data, playersHash] = await Promise.all([
            client.hGetAll(`game:${gameId}`),
            client.hGetAll(`game:${gameId}:players`)
        ]);

        if (!data || !data.gameId) return null;

        let meta = {};
        try {
            meta = data.meta ? JSON.parse(data.meta) : {};
        } catch (e) {
            meta = {};
        }

        // Trasforma la hash players (username -> json) in array di oggetti
        const players = [];
        if (playersHash) {
            for (const [username, value] of Object.entries(playersHash)) {
                let parsed = {};
                try {
                    parsed = value ? JSON.parse(value) : {};
                } catch (e) {
                    parsed = {};
                }
                players.push({ username, role: parsed.role ?? null, order: parsed.order ?? null, muted: parsed.muted ?? false });
            }
        }

        return {
            gameId: data.gameId,
            roomId: data.roomId,
            status: data.status,
            players,
            currentPlayers: players.length,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            meta
        };
    }

    /**
     * Recupera tutte le partite correlate a `roomId`.
     * @param {string} roomId
     * @returns {Array<object>} array di oggetti partita
     */
    static async getByRoom(roomId) {
        const client = getRedisClient();
        const ids = await client.sMembers(`games:by_room:${roomId}`);
        if (!ids || ids.length === 0) return [];

        const games = await Promise.all(ids.map(id => Game.get(id)));
        return games.filter(g => g !== null);
    }

    /**
     * Aggiorna lo status della partita
     * @param {string} gameId
     * @param {string} newStatus
     */
    static async updateStatus(gameId, newStatus) {
        const client = getRedisClient();

        if (!Object.values(GameStatus).includes(newStatus)) {
            throw new Error('Status non valido');
        }

        const exists = await client.exists(`game:${gameId}`);
        if (!exists) throw new Error('Game non trovato');

        const multi = client.multi();
        multi.hSet(`game:${gameId}`, 'status', newStatus);
        multi.hSet(`game:${gameId}`, 'updatedAt', new Date().toISOString());
        await multi.exec();
    }

    /**
     * Rimuove un giocatore dalla partita.
     * Se dopo la rimozione non ci sono più giocatori, elimina la partita.
     * @param {string} gameId
     * @param {string} username
     * @returns {boolean|null} true se rimosso, null se la partita è stata eliminata, false se game non esiste
     */
    static async removePlayer(gameId, username) {
        const client = getRedisClient();
        const exists = await client.exists(`game:${gameId}`);
        if (!exists) return false;

        // Rimuovi il campo username dalla hash dei players
        await client.hDel(`game:${gameId}:players`, username);

        // Verifica se sono rimasti giocatori
        const remaining = await client.hLen(`game:${gameId}:players`);
        if (remaining === 0) {
            // Elimina la partita interamente
            await Game.delete(gameId);
            return null;
        }

        // Aggiorna timestamp
        await client.hSet(`game:${gameId}`, 'updatedAt', new Date().toISOString());
        return true;
    }

    /**
     * Elimina una partita e pulisce gli indici secondari
     * @param {string} gameId
     * @returns {boolean}
     */
    static async delete(gameId) {
        const client = getRedisClient();
        const game = await Game.get(gameId);
        if (!game) return false;

        const multi = client.multi();
        multi.del(`game:${gameId}`);
        multi.del(`game:${gameId}:players`);
        multi.sRem('games:active', gameId);
        multi.sRem(`games:by_room:${game.roomId}`, gameId);

        const results = await multi.exec();
        return results.some(r => r > 0);
    }

    /**
     * Controlla l'esistenza
     * @param {string} gameId
     * @returns {boolean}
     */
    static async exists(gameId) {
        const client = getRedisClient();
        return await client.exists(`game:${gameId}`) === 1;
    }

}

module.exports = { Game, GameStatus };
