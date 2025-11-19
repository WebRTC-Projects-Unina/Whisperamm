const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;
const { randomUUID } = require('crypto'); // 'crypto' è un modulo built-in
const cookieParser = require('cookie-parser');
//Inizio aggiunta
// aggancio chatSocket.js
const http = require('http');
const { Server } = require('socket.io');
const registerChatHandlers = require('./socket/chatSocket');

const server = http.createServer(app);

const io = new Server(server, {
    connectionStateRecovery: {
        enabled: true,         // Indica se recuperare lo stato di connessione in caso di disconnessione (es. ricarica)
    },
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
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

//Middleware
app.use(cookieParser());
app.use(express.json());

// Importo le rotte
const routes = require('./routes/userRoutes');
routes(app); // Registra le rotte

server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
