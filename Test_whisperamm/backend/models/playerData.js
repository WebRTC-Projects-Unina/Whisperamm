const { getRedisClient } = require('./redis');

// Definiamo qui la chiave Redis standard per coerenza
const getPlayersKey = (gameId) => `game:${gameId}:players`; 

class PlayerData {
  
  /**
   * FACTORY METHOD: Restituisce l'oggetto Player standardizzato.
   * Non salva in Redis, prepara solo i dati.
   */
  static createPlayerData(username, role, dice1, dice2, color = null, order = 0) {
    return {
        username,
        role,           // 'CIVILIAN' o 'IMPOSTOR'
        color,
        dice1,
        dice2,
        diceValue: dice1 + dice2, // Somma dei due dadi
        order,          // Ordine di turno
        hasRolled: false,
        hasSpoken: false,
        hasVoted: false,
        isAlive: true,
        canTalk: true, // Di base true in quanto appena accedo a Game posso parlare
        votesReceived: 0, 
        
    };
  }

  static async update(gameId, username, updates) {
    const client = getRedisClient();
    const key = getPlayersKey(gameId); // USO LA FUNZIONE HELPER

    // 1. Leggi vecchio
    const rawData = await client.hGet(key, username);
    if (!rawData) throw new Error(`Player ${username} non trovato`);

    // 2. Unisci
    const currentPlayer = JSON.parse(rawData);
    const updatedPlayer = { ...currentPlayer, ...updates };

    // 3. Salva
    await client.hSet(key, username, JSON.stringify(updatedPlayer));

    return updatedPlayer;
  }
  
  static async get(gameId, username) {
      const client = getRedisClient();
      const key = getPlayersKey(gameId); // USO LA FUNZIONE HELPER
      const raw = await client.hGet(key, username);
      return raw ? JSON.parse(raw) : null;
  }

  static async remove(gameId, username) {
    const client = getRedisClient();
    const key = getPlayersKey(gameId); // USO LA FUNZIONE HELPER (Corretto il bug :playerData)
    await client.hDel(key, username);
  }
  
}


module.exports = { PlayerData };