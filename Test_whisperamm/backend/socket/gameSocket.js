// src/socket/gameSocket.js
const GameService = require('../services/gameService');
const RoomService = require('../services/roomService');
const NotificationService = require('../services/notificationService'); // Nota la maiuscola se il file è maiuscolo
const PayloadUtils = require('../utils/gamePayloadUtils')

async function handleGameStarted(io, socket, { roomId }) {
    const { username } = socket.data;

    gamePayload = {roomId}
    console.log("Game Payload"+gamePayload)
    NotificationService.broadcastToRoom(
        io,             // 1. io
        roomId,         // 2. roomId (Corretto: prima la stanza)
        'gameStarted',  // 3. eventName (Corretto: poi il nome evento)
        gamePayload     // 4. payload (Serve al frontend per il navigate!)
    );

    try {
        // 1. VALIDAZIONE, boh nun serv pens
        const isHost = await RoomService.isUserHost(roomId, username);
        if (!isHost) {
            socket.emit('lobbyError', { message: 'Solo l\'admin può avviare la partita.' });
            return;
        }

        console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);

        // 2. BUSINESS LOGIC (Creazione)
        const game = await GameService.createGame(roomId);

        // 3. STEP A: BROADCAST (Dati Pubblici, round e phase)
        const publicPayload = PayloadUtils.buildPublicGameData(game);
        


        NotificationService.broadcastToRoom(
            io, 
            roomId, 
            'parametri', //Sennò front-end non sa quando passare a component..  
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

async function handleRollDice(io, socket) {
    const { username, roomId } = socket.data;

    try {
        const game = await GameService.getGameSnapshotByRoomId(roomId);
        
        if (!game) {
            return socket.emit('error', { message: 'Partita non trovata.' });
        }

        // Recuperiamo il valore DEL SOLO UTENTE che ha chiamato l'evento
        const myData = game.players[username];
        
        // OPPURE, se hai deciso di usare l'Array, usa questo:
        // let myData = game.players.find(p => p.username === username);

        if (!myData) {
            console.error(`Utente ${username} non trovato nella partita`);
            return;
        }

        // 3. Costruiamo il payload pubblico
        // Diciamo a tutti: CHI ha lanciato e COSA ha fatto
        const publicPayload = {
            username: username,          // "Chi è stato?" -> Mario
            diceValue: myData.diceValue  // "Che numero è uscito?" -> 8
        };

        // 4. BROADCAST A TUTTI (Incluso chi ha lanciato)
        NotificationService.broadcastToRoom(
            io, 
            roomId, 
            'playerRolledDice', // Nuovo nome evento, più chiaro
            publicPayload
        );
        
        console.log(`[Socket] Broadcast: ${username} ha fatto ${myData.diceValue} in room ${roomId}`);

    } catch (err) {
        console.error(`[Errore] handleRollDice:`, err);
    }
}

function attach(socket, io) {
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
    socket.on('DiceRoll', () => handleRollDice(io, socket));
}

module.exports = { attach };