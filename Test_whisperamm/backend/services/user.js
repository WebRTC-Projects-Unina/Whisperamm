const { getRedisClient } = require('../config_redis/redis');
const crypto = require('crypto');

// Stati validi (enum-like)
const UserStatus = {
  ONLINE: 'online',
  INGAME: 'ingame'
};

class User {
  static async create(username, status = UserStatus.OFFLINE) {
    const client = getRedisClient();
    
    // Verifica username duplicato
    const exists = await client.get(`username:${username}`);
    if (exists) {
      throw new Error('Username già esistente');
    }
    
    // istante di creazione dello user
    const createdAt = new Date().toISOString();

    //Per creare una transazione in redis, in modo da garantire atomicità ed 1 solo RTT 
    //invece di multipli, invio l'oggetto intero e non le singole proprietà da aggiungere all'oggetto.
    const multi = client.multi(); 
    
    // HASH per dati utente (Uso hash perchè è pratico per oggetti con più campi)
    await multi.hSet(`user:${username}`, {
      username,
      status,
      createdAt,
      updatedAt: createdAt  //Ci potrebbe servire per eliminare gli utenti inattivi
    });

    /*
      Questo memorizza la seguente struttura in Redis:
        Key: user:alice
        Type: Hash
        Content:
          username   → "alice"
          status     → "OFFLINE"
          createdAt  → "2025-11-19T10:30:00.000Z"
          updatedAt  → "2025-11-19T10:30:00.000Z"
    */
    
    // Valutare se possa essere utile
    //multi.zAdd('users:activity', { score: Date.now(), value: username });
    //Questo metodo crea una sorted list chiamato users:activity che ordina gli utenti in base alla loro ultima attività.
    //Potrebbe essere utile per funzionalità future come "most active users" o "recently active users".
    //E in generale per query più efficienti sugli utenti basate sull'attività.
    
    await multi.exec() // Esegui la transazione
    return username
    
  }

  static async exists(username) {
    const client = getRedisClient();
    const exists = await client.exists(`user:${username}`);
    return exists === 1;
  }

  /**
   * Recupera i dati di un utente specifico dato lo username.
   * @param {string} username - Lo username dell'utente da recuperare.
   * @returns {Object|null} Un oggetto con i dati dell'utente o null se non trovato.
   */
  static async get(username) {
    const client = getRedisClient();
    //const userData = await client.hGetAll(`user:${username}`);  
    //Recupera tutti i campi e valori dell'hash in un'unica operazione

    // Recupera solo username e status
    const [usernameValue, status] = await client.hmGet(`user:${username}`, [
      'username',
      'status'
    ]);
  
    // Se username non esiste, ritorna null
    if (!usernameValue) return null;

    return {
      username: usernameValue,
      status: status
    };
    
  }
  /**
 * Aggiorna lo stato di un utente specifico dato lo username.
 * @param {string} username - Lo username dell'utente da aggiornare.
 * @param {string} newStatus - Il nuovo stato (da UserStatus).
 */
  static async updateStatusByUsername(username, newStatus) {
    const redisClient = getRedisClient();
    const key = `user:${username}`;

    const updatedCount = await redisClient.hSet(key, 'status', newStatus);
    
    if (updatedCount === 0 && !(await redisClient.exists(key))) {
         throw new Error(`Utente non trovato: ${username}`);
    }
    
  }
}

module.exports = { User, UserStatus };  