// models/User.js
const { getRedisClient } = require('./redis');

const UserStatus = {
  ONLINE: 'online',
  INGAME: 'inGame',
};

const TOKEN_TTL = 3*60*60; // 3 ore in secondi (deve corrispondere al JWT)

class User {
  static async create(username, status = UserStatus.ONLINE) {
    const client = getRedisClient();
    const key = `user:${username}`;
    const exists = await client.exists(key);
    
    if (exists) {
      return null; // Lascia al service gestire l'errore
    }

    // Crea l'hash e imposta il TTL
    await client.hSet(key, {
      username,
      status,
      isready: 'false',
    });
    
    // Imposta TTL - Redis eliminerà automaticamente dopo 3 ore
    await client.expire(key, TOKEN_TTL);
    
    return username;
  }

  static async exists(username) {
    const client = getRedisClient();
    const exists = await client.exists(`user:${username}`);
    return exists === 1;
  }

  static async get(username) {
    const client = getRedisClient();
    const key = `user:${username}`;
    
    const [usernameValue, status, isready] = await client.hmGet(key, [
      'username',
      'status',
      'isready'
    ]);
    
    if (!usernameValue) return null;
    
    return {
      username: usernameValue,
      status: status,
      isready: (isready === 'true')
    };
  }

  static async updateStatus(username, newStatus) {
    const client = getRedisClient();
    const key = `user:${username}`;
    const exists = await client.exists(key);
    
    if (!exists) return false;
    
    await client.hSet(key, 'status', newStatus);
    // Rinnova il TTL ad ogni aggiornamento
    await client.expire(key, TOKEN_TTL);
    
    return true;
  }

  // Imposta lo stato ready
  static async setReady(username, isReady) {
    const client = getRedisClient();
    const key = `user:${username}`;
    const exists = await client.exists(key);
    
    if (!exists) return false;
    
    await client.hSet(key, 'isready', isReady ? 'true' : 'false');
    // Rinnova il TTL ad ogni aggiornamento
    await client.expire(key, TOKEN_TTL);
    
    return true;
  }

  // Ottiene solo lo stato ready
  static async getReady(username) {
    const client = getRedisClient();
    const isready = await client.hGet(`user:${username}`, 'isready');
    return isready === 'true';
  }

  // Rinnova il TTL quando l'utente è attivo (importante!)
  static async renewTTL(username) {
    const client = getRedisClient();
    const key = `user:${username}`;
    const exists = await client.exists(key);
    
    if (!exists) return false;
    
    await client.expire(key, TOKEN_TTL);
    return true;
  }

  // Ottiene il TTL rimanente (utile per debug/monitoring)
  static async getTTL(username) {
    const client = getRedisClient();
    const key = `user:${username}`;
    return await client.ttl(key); // Ritorna secondi rimanenti, -1 se no TTL, -2 se non esiste
  }

  // Elimina utente manualmente (se necessario)
  static async delete(username) {
    const client = getRedisClient();
    const key = `user:${username}`;
    await client.del(key);
  }

  // Ottieni tutti gli utenti (per debug/admin)
  static async getAll() {
    const client = getRedisClient();
    const keys = await client.keys('user:*');
    const users = [];
    
    for (const key of keys) {
      const [username, status, isready] = await client.hmGet(key, [
        'username',
        'status',
        'isready'
      ]);
      
      if (username) {
        users.push({
          username,
          status,
          isready: isready === 'true'
        });
      }
    }
    
    return users;
  }
}

module.exports = { User, UserStatus };