// backend/models/playerData.js
const { getRedisClient } = require('../config_redis/redis');

const PlayerRole = {
  CIVILIAN: '0',
  IMPOSTOR: '1'
};

class PlayerData {
  
  /**
   * Crea un nuovo giocatore da zero.
   * Usa questo quando inizia la partita.
   */
  static async create(gameId, username, diceValue = 0, role, color) {
    const client = getRedisClient();
    const key = `game:${gameId}:playerData`;

    const newPlayer = {
        username,
        dice1,
        dice2, // Valore del dado (1-12)
        role, // Ruolo del giocatore (es. civile o impostore)
        color,     // Colore scelto dal giocatore
        isRolling: false, // Se il giocatore sta lanciando i dadi/ ha lanciato
        isAlive: true, // Se il giocatore è vivo o eliminato
        canTalk: true,
        votesReceived: 0, 
    };

    // Nota: Se usi 'executor' (multi), non mettere 'await' qui se vuoi concatenare
    // Ma per semplicità qui assumiamo uso standard o che gestisci la promise fuori.
    await client.hSet(key, username, JSON.stringify(newPlayer));
    
    return newPlayer;
  }


  /**
   * Recupera i dati di un SINGOLO giocatore
   * Utile quando un utente fa un'azione specifica.
   * @returns {Promise<Object|null>} L'oggetto player o null se non esiste
   */
  static async get(gameId, username) {
    const client = getRedisClient();
    const key = `game:${gameId}:playerData`;
    
    // Legge solo il campo specifico (veloce)
    const rawData = await client.hGet(key, username);
    
    if (!rawData) return null;
    return JSON.parse(rawData);
  }

  /**
   * Recupera TUTTI i giocatori della partita.
   * FONDAMENTALE per inviare lo stato iniziale al frontend via WebSocket.
   * @returns {Promise<Array>} Lista di oggetti player
   */
  static async getAll(gameId) {
    const client = getRedisClient();
    const key = `game:${gameId}:playerData`;

    // Scarica tutto l'Hash in un colpo solo
    const allDataRaw = await client.hGetAll(key);
    
    // Converte da { "mario": "{...}", "luigi": "{...}" } 
    // a [ {username: "mario", ...}, {username: "luigi", ...} ]
    return Object.values(allDataRaw).map(jsonStr => JSON.parse(jsonStr));
  }

  /**
   * Aggiorna SOLO alcuni campi di un giocatore esistente.
   * Esempio: update(gameId, 'Mario', { diceValue: 5, isRolling: false })
   * @param {Object} updates - Oggetto con i campi da modificare
   */
  static async update(gameId, username, updates) {
    const client = getRedisClient();
    const key = `game:${gameId}:playerData`;

    // 1. Leggiamo lo stato attuale (per non perdere il colore o il ruolo)
    //    Dobbiamo usare 'this.get' perché siamo in un metodo statico
    const currentPlayer = await PlayerData.get(gameId, username);

    if (!currentPlayer) {
      throw new Error(`Giocatore ${username} non trovato nella partita ${gameId}`);
    }

    // 2. Facciamo il merge dei dati vecchi con quelli nuovi
    //    I campi in 'updates' sovrascrivono quelli vecchi
    const updatedPlayer = {
      ...currentPlayer,
      ...updates
    };

    // 3. Salviamo il nuovo oggetto completo
    await client.hSet(key, username, JSON.stringify(updatedPlayer));

    return updatedPlayer;
  }

  /**
   * Rimuove un giocatore (es. disconnessione o morte definitiva)
   */
  static async remove(gameId, username) {
    const client = getRedisClient();
    await client.hDel(`game:${gameId}:playerData`, username);
  }

}

module.exports = { PlayerData, PlayerRole };