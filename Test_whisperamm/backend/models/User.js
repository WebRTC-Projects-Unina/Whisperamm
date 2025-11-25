// models/User.js
const { getRedisClient } = require('../config_redis/redis');

const UserStatus = {
  ONLINE: 'online',
  INGAME: 'inGame',
};

class User {
  static async create(username, status = UserStatus.ONLINE) {
    const client = getRedisClient();
    
    const exists = await client.exists(`user:${username}`);
    if (exists) {
      return null; // Lascia al service gestire l'errore
    }

    const multi = client.multi();
    
    await multi.hSet(`user:${username}`, {
      username,
      status,
      isready: 'false', //Utile per il ready state in lobby
    });
    
    await multi.exec();
    return username;
  }

  static async exists(username) {
    const client = getRedisClient();
    const exists = await client.exists(`user:${username}`);
    return exists === 1;
  }

  static async get(username) {
    const client = getRedisClient();
    const [usernameValue, status, isready] = await client.hmGet(`user:${username}`, [
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
    return true;
  }
  // Imposta lo stato ready
  static async setReady(username, isReady) {
    const client = getRedisClient();
    const key = `user:${username}`;
    
    const exists = await client.exists(key);
    if (!exists) return false;
    
    await client.hSet(key, 'isready', isReady ? 'true' : 'false');
    return true;
  }

  // Ottiene solo lo stato ready
  static async getReady(username) {
    const client = getRedisClient();
    const isready = await client.hGet(`user:${username}`, 'isready');
    return isready === 'true';
  }
}

module.exports = { User, UserStatus };