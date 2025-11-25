// src/socket/gameSocket.js
const GameService = require('../services/gameService');
const RoomService = require('../services/roomService');
const NotificationService = require('../services/notificationService'); // Nota la maiuscola se il file è maiuscolo
const PayloadUtils = require('../utils/gamePayloadUtils')

async function handleGameStarted(io, socket, { roomId }) {
    const { username } = socket.data;

    try {
        // 1. VALIDAZIONE, boh nun serv pens
        const isHost = await RoomService.isUserHost(roomId, username);
        if (!isHost) {
            socket.emit('lobbyError', { message: 'Solo l\'admin può avviare la partita.' });
            return;
        }

        console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);

        // 2. BUSINESS LOGIC (Creazione)
        const playersList = await RoomService.getPlayers(roomId);
        const game = await GameService.createGame(roomId, playersList);

        // 3. STEP A: BROADCAST (Dati Pubblici, round e phase)
        const publicPayload = PayloadUtils.buildPublicGameData(game);
        
        NotificationService.broadcastToRoom(
            io, 
            roomId, 
            'gameStarted', //Sennò front-end non sa quando passare a component..  
            publicPayload
        );

        console.log("Tutti hanno ricevuto le informazioni base")

        // 4. STEP B: TARGETED (Dati Privati)
        // Diciamo a ciascuno: "Ecco chi sei tu segretamente".
        // Il Frontend userà questo per mostrare la parola segreta.
        NotificationService.sendPersonalizedToRoom(
            io, 
            roomId, 
            game.players, 
            'identityAssigned', // <--- Evento B (Privato)
            (player) => {
                // Callback che costruisce il dato privato
                return PayloadUtils.buildPrivateIdentity(player, game.secrets);
            }
        );

    } catch (err) {
        console.error(`[Errore] handleGameStarted:`, err);
        socket.emit('lobbyError', { 
            message: err.message || 'Errore avvio partita' 
        });
    }
}

function attach(socket, io) {
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
}

module.exports = { attach };