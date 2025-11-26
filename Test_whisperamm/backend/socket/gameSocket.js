// src/socket/gameSocket.js
const GameService = require('../services/gameService');
const RoomService = require('../services/roomService');
const NotificationService = require('../services/notificationService'); // Nota la maiuscola se il file è maiuscolo
const PayloadUtils = require('../utils/gamePayloadUtils');
const { Game, GamePhase } = require('../models/Game');

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

        // Mandiamo a ciascun giocatore il suo ruolo segreto e cambio fase a DICE
        GameService.advancePhase(game.id, GamePhase.DICE);
        // Notifichiamo tutti del cambio fase
        NotificationService.broadcastToRoom(
            io,
            roomId,
            'phaseChanged',
            { phase: GamePhase.DICE }
        );

    } catch (err) {
        console.error(`[Errore] handleGameStarted:`, err);
        socket.emit('lobbyError', { 
            message: err.message || 'Errore avvio partita' 
        });
    }
    
}

async function handleRollDice(io, socket) {
    const username = socket.data.username;
    const roomId = socket.data.roomId;
    console.log(`[Socket] Ricevuta richiesta DiceRoll da ${username} in room ${roomId}`);

    try {

        // Recupera Game ID
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;

        // AGGIORNAMENTO STATO
        // Questo aggiorna solo il singolo giocatore su Redis
        await GameService.updatePlayerState(gameId, username, { hasRolled: true });

        // RECUPERIAMO IL GIOCO AGGIORNATO (che ora include il hasRolled: true appena messo)
        const game = await GameService.getGameSnapshot(gameId);

        // Inviamo il risultato a tutti (Broadcast)
        const myData = game.players.find(p => p.username === username);
        NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
            username: username,
            diceValue: myData.diceValue
        });
        
        
        // Controlliamo se TUTTI hanno lanciato
        if (GameService.checkAllPlayersRolled(game.players)) {
            console.log(`[Game] Tutti hanno lanciato in room ${roomId}. Cambio fase!`);

            // Cambia fase nel DB
            const updatedGame = await GameService.advancePhase(gameId, GamePhase.TURN_ASSIGNMENT); // o TURN_ASSIGNMENT

            // Notifica tutti che il gioco inizia
            // Usiamo buildPublicGameData per mandare lo stato aggiornato (con la nuova fase)
            const payload = PayloadUtils.buildPublicGameData(updatedGame);
            
            // Aspettiamo magari 2-3 secondi per far vedere l'animazione dell'ultimo dado
            setTimeout(() => {
                NotificationService.broadcastToRoom(io, roomId, 'phaseChange', payload);
            }, 3000);
        }

    } catch (err) {
        console.error(`[Errore] handleRollDice:`, err);
    }
}

function attach(socket, io) {
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
    socket.on('DiceRoll', () => handleRollDice(io, socket));
}

module.exports = { attach };