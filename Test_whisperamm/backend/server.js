require('dotenv').config(); //Importa e configura variabili d'ambiente dal file .env
const express = require('express');
const app = express();
const PORT = process.env.PORT;
const { randomUUID } = require('crypto'); // 'crypto' è un modulo built-in
const cookieParser = require('cookie-parser');
const { connectRedis } = require('./config_redis/redis');

//Inizio aggiunta
// aggancio chatSocket.js
const http = require('http');
const { Server } = require('socket.io');
const registerChatHandlers = require('./socket/chatSocket');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // Deve corrispondere esattamente all'origine del tuo client
    origin: 'http://localhost:5173', 
    methods: ['GET', 'POST'],
    credentials: true // Abilitato per 'withCredentials: true' nel client
  }
  
});


registerChatHandlers(io);


//Connessione a Redis e Test connessione
connectRedis()
  .then(() => {
    console.log('Connessione a Redis avvenuta con successo') ;
  })
  .catch((err) => {
    console.error('Errore di connessione a Redis:', err);
  });


const cors = require('cors');
// Usa CORS con origine esplicita e credenziali abilitate
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

//Middleware
app.use(cookieParser());
app.use(express.json());

// Importo le rotte
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
userRoutes(app); // Registra le rotte
roomRoutes(app); // Registra le rotte

server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
