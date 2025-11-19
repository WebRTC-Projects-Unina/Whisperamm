const redis = require('redis');

// Configurazione e connessione a Redis
let redisClient = null;

// Funzione per connettersi a Redis
async function connectRedis() {
  if (redisClient) return redisClient; // Se già connesso, ritorna il client esistente

  // Crea il client Redis
  redisClient = redis.createClient({
    username: 'default',  
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    }
  });

  // Gestione eventi di connessione
  redisClient.on('error', err => console.error('Redis Client Error', err));
  redisClient.on('connect', () => console.log('Redis connesso'));

  // Connessione al server Redis
  await redisClient.connect(); 
  return redisClient; 
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis non ancora connesso');
  }
  return redisClient;
}

module.exports = { connectRedis, getRedisClient };