const express = require('express'); 
const app = express();
const PORT = process.env.PORT || 8080;
const { randomUUID } = require('crypto'); // 'crypto' è un modulo built-in
const cookieParser = require('cookie-parser');

// Socket.io setup
const http = require('http');
const { Server } = require('socket.io');
const registerChatHandlers = require('../socket/chatSocket');
const server = http.createServer(app);

//Importo le rotte
const userRoutes = require('./routes/user.route.js');
const gameRoutes = require('./routes/game.route.js');

const io = new Server(server, {
    connectionStateRecovery: {
    },
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
    },
});

registerChatHandlers(io);

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

app.use("/api/user", userRoutes)
app.use("/api/game", gameRoutes)

server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
