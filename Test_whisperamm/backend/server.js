require('dotenv').config(); //Importa e configura variabili d'ambiente dal file .env
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;
const path = require('path'); // 1. NUOVO: Serve per gestire i percorsi dei file
const { randomUUID } = require('crypto'); // 'crypto' è un modulo built-in
const cookieParser = require('cookie-parser');
const { connectRedis } = require('./models/redis');

//Inizio aggiunta
// aggancio socket controller
const http = require('http');
const { Server } = require('socket.io');
const registerSocketController = require('./socket/controllerSocket');

const server = http.createServer(app);
const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
const io = new Server(server, {
  cors: {
    // Deve corrispondere esattamente all'origine del tuo client
    origin: clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true // Abilitato per 'withCredentials: true' nel client
  }
  
});

// Registra un unico controller che attacca tutti gli handler per connessione
registerSocketController(io);

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
    origin: clientOrigin,
    credentials: true,
  })
);

//Middleware
app.use(cookieParser());
app.use(express.json());

// Importo le rotte
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
//const janusRoutes = require('./routes/janusRoutes');
userRoutes(app); // Registra le rotte
roomRoutes(app); // Registra le rotte
//janusRoutes(app); // Registra le rotte

// --- 3. NUOVO: SERVIRE IL FRONTEND (Produzione) ---

// Serve i file statici (immagini, css, js) dalla cartella 'dist'
app.use(express.static(path.join(__dirname, 'dist')));

// "Catch-all": Qualsiasi richiesta che non è stata gestita dalle API sopra
// restituisce la pagina index.html di React.
app.get(/^(.*)$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
