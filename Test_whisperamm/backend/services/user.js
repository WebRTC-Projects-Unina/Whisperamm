const { getRedisClient } = require('../config_redis/redis');
const crypto = require('crypto');

// Stati validi (enum-like)
const UserStatus = {
  ONLINE: 'online',
  IN_GAME: 'inGame'
};

class User {
  static async create(username, status = UserStatus.OFFLINE) {
    const client = getRedisClient();
    
    // Verifica username duplicato
    const existingUserId = await client.get(`username:${username}`);
    if (existingUserId) {
      throw new Error('Username già esistente');
    }
    
    // Valida stato
    if (!Object.values(UserStatus).includes(status)) {
      throw new Error(`Stato non valido. Valori permessi: ${Object.values(UserStatus).join(', ')}`);
    }
    
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // HASH per dati utente (permette update parziali)
    await client.hSet(`user:${id}`, {
      id,
      username,
      status
    });
    
    // Mapping username → ID
    await client.set(`username:${username}`, id);
    
    // Aggiungi a SET dello stato (per query veloci)
    await client.sAdd(`users:status:${status}`, id);
    
    return { id, username, status, createdAt, updatedAt: createdAt };
  }
  
  static async findById(id) {
    const client = getRedisClient();
    const user = await client.hGetAll(`user:${id}`);
    return Object.keys(user).length > 0 ? user : null;
  }
  
  static async findByUsername(username) {
    const client = getRedisClient();
    const userId = await client.get(`username:${username}`);
    if (!userId) return null;
    return await User.findById(userId);
  }
  
  // Aggiorna solo lo stato (efficiente!)
  static async updateStatus(id, newStatus) {
    const client = getRedisClient();
    
    // Valida stato
    if (!Object.values(UserStatus).includes(newStatus)) {
      throw new Error(`Stato non valido. Valori permessi: ${Object.values(UserStatus).join(', ')}`);
    }
    
    // Recupera stato attuale
    const currentStatus = await client.hGet(`user:${id}`, 'status');
    if (!currentStatus) {
      throw new Error('Utente non trovato');
    }
    
    // Se lo stato è già quello, non fare nulla
    if (currentStatus === newStatus) {
      return true;
    }
    
    // Aggiorna stato e timestamp
    await client.hSet(`user:${id}`, {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
    
    // Sposta l'utente dal SET vecchio a quello nuovo
    await client.sRem(`users:status:${currentStatus}`, id);
    await client.sAdd(`users:status:${newStatus}`, id);
    
    return true;
  }
  
  // Query: tutti gli utenti con un certo stato
  static async findByStatus(status) {
    const client = getRedisClient();
    
    // Recupera tutti gli ID con quello stato
    const userIds = await client.sMembers(`users:status:${status}`);
    
    // Recupera i dati completi
    const users = await Promise.all(
      userIds.map(id => User.findById(id))
    );
    
    return users.filter(user => user !== null);
  }
  
  // Conta utenti per stato
  static async countByStatus(status) {
    const client = getRedisClient();
    return await client.sCard(`users:status:${status}`);
  }
  
  // Statistiche globali
  static async getStatusStats() {
    const client = getRedisClient();
    
    const stats = {};
    for (const status of Object.values(UserStatus)) {
      stats[status] = await client.sCard(`users:status:${status}`);
    }
    
    return stats;
  }
  
  static async delete(id) {
    const client = getRedisClient();
    const user = await User.findById(id);
    if (!user) return false;
    
    // Rimuovi da tutte le strutture
    await client.del(`user:${id}`);
    await client.del(`username:${user.username}`);
    await client.sRem(`users:status:${user.status}`, id);
    
    return true;
  }
  
  // Validazione helper
  static isValidStatus(status) {
    return Object.values(UserStatus).includes(status);
  }
}

module.exports = { User, UserStatus };  