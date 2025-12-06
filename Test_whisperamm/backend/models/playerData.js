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
    const key = getPlayersKey(gameId);

    const rawData = await client.hGet(key, username);
    if (!rawData) throw new Error(`Player ${username} non trovato`);

    // PARSING SICURO
    const currentPlayer = this._safeJsonParse(rawData); 
    if (!currentPlayer) throw new Error(`Dati corrotti per ${username}`);

    const updatedPlayer = { ...currentPlayer, ...updates };

    await client.hSet(key, username, JSON.stringify(updatedPlayer));
    return updatedPlayer;
  }
  
  static async get(gameId, username) {
      const client = getRedisClient();
      const key = getPlayersKey(gameId);
      const raw = await client.hGet(key, username);
      
      // PARSING SICURO
      return this._safeJsonParse(raw);
  }

  /**
   * Incrementa i voti in modo un pochino più sicura mah...
   * Alla fine comunque rischiamo di non incrementarlo, magari può aver senso per i voti
   * tenere una key, però a questo punto non mi serve più il JSON...
   */
 static async incrementVotes(gameId, username) {
    const client = getRedisClient();
    const key = getPlayersKey(gameId);
    const MAX_RETRIES = 5; 

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await client.watch(key);

            const rawData = await client.hGet(key, username);
            const player = this._safeJsonParse(rawData);

            if (!player) {
                await client.unwatch();
                return null; 
            }

            player.votesReceived = (player.votesReceived || 0) + 1;
            
            const multi = client.multi();
            multi.hSet(key, username, JSON.stringify(player));
            const results = await multi.exec();

            if (results) return player.votesReceived; // SUCCESSO!

            // --- AGGIUNTA FONDAMENTALE QUI SOTTO ---
            
            // Se siamo qui, c'è stato un conflitto.
            // Aspettiamo un tempo casuale tra 20ms e 100ms prima di riprovare.
            // Questo "sparpaglia" le richieste concorrenti.
            const jitter = Math.floor(Math.random() * 80) + 20; 
            await this._sleep(jitter);
            
            // Il ciclo 'for' ora ricomincerà, ma dopo la pausa.

        } catch (err) {
            await client.unwatch();
            throw err;
        }
    }
    throw new Error(`Troppi conflitti nel voto per ${username}`);
  }
  
  static _safeJsonParse(str) {  //Da mettere in utils..
        try { return JSON.parse(str); } catch (e) { return null; } 
  }
}

 



module.exports = { PlayerData };