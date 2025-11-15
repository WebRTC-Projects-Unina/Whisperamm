const express = require('express');
const session = require('express-session'); // Importa express-session
const app = express();
const PORT = process.env.PORT || 8080;

//Inizio aggiunta
// aggancio chatSocket.js
const http = require('http');
const { Server } = require('socket.io');
const registerChatHandlers = require('./socket/chatSocket');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});


registerChatHandlers(io);

//fine aggiunta

const cors = require('cors');
// Usa CORS con origine esplicita e credenziali abilitate
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);
// --- fine CORS ---
app.use(express.json());

// Configurazione della sessione in memoria
// Questo è il "database in-memory" per le sessioni
app.use(session({
    secret: 'il-tuo-segreto-per-mister-white', // Una stringa segreta per firmare i cookie
    resave: false,
    saveUninitialized: true,
    rolling: true, // Fa in modo che il tempo venga resettato quando un utente fa una richiesta -> maxAge parte dopo che un'utente diventa inattivo
    cookie: {
        secure: false, // Metti 'true' se sei in HTTPS
        maxAge: 1000 * 60 * 30 // Cookie valido per 30 minuti
    }
}));

// Importo le rotte
const routes = require('./routes/userRoutes');
routes(app); // Registra le rotte

// Avvio del server
/*
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
*/

server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
