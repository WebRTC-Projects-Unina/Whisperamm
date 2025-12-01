// src/socket/gameSocket.js
const GameService = require('../services/gameService');
const RoomService = require('../services/roomService');
const NotificationService = require('../services/notificationService'); // Nota la maiuscola se il file è maiuscolo
const PayloadUtils = require('../utils/gamePayloadUtils');
const { Game, GamePhase } = require('../models/Game');

async function handleGameStarted(io, socket, { roomId }) {
    const { username } = socket.data;

    gamePayload = {roomId}
    
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
            {   phase: GamePhase.DICE,
                startTimer: true  // Indica al frontend di avviare il timer
             }
        );



    } catch (err) {
        console.error(`[Errore] handleGameStarted:`, err);
        socket.emit('lobbyError', { 
            message: err.message || 'Errore avvio partita' 
        });
    }
    
}

async function disconnectInGame(io,socket){
    
}

async function handleRollDice(io, socket) {
    const username = socket.data.username;
    const roomId = socket.data.roomId;

    try {

        // Recupera Game ID
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;

        // RECUPERIAMO IL GIOCO AGGIORNATO (che ora include il hasRolled: true appena messo)
        let game = await GameService.getGameSnapshot(gameId);

        // Inviamo il risultato a tutti (Broadcast)
        const myData = game.players.find(p => p.username === username);

        // Ignora se ha già lanciato, in teoria è gestita dal frontend ma per sicurezza
        if (myData.hasRolled) {
        return; 
        }

        // Questo aggiorna solo il singolo giocatore su Redis e ritorna la lista aggiornata
        await GameService.updatePlayerState(gameId, username, { hasRolled: true });
        
        NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
            username: username,
            dice1: myData.dice1,
            dice2: myData.dice2,
            color: myData.color
        });
        
        // Recupera di nuovo lo stato del gioco aggiornato
        game = await GameService.getGameSnapshot(gameId);

        // Controlliamo se TUTTI hanno lanciato
        if (GameService.checkAllPlayersRolled(game.players)) {
            // Cambia fase nel DB
            const updatedGame = await GameService.advancePhase(gameId, GamePhase.TURN_ASSIGNMENT); // o TURN_ASSIGNMENT

            // Notifica tutti che il gioco inizia
            // Usiamo buildPublicGameData per mandare lo stato aggiornato (con la nuova fase)
            const payload = PayloadUtils.buildPublicGameData(updatedGame);
            
            // Aspettiamo magari 2-3 secondi per far vedere l'animazione dell'ultimo dado
            setTimeout(() => {
                NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', payload);
            }, 4000);
        }

    } catch (err) {
        console.error(`[Errore] handleRollDice:`, err);
    }
}

async function handleOrderPlayers(io, socket){
    const roomId = socket.data.roomId;

    try {
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) {
            console.log("❌ Game non trovato per room:", roomId);
            return;
        }
        console.log(`[Socket] OrderPlayers ricevuto in room ${roomId}`);
        let game = await GameService.getGameSnapshot(gameId);
        const sortedPlayers = GameService.sortPlayersByDice(game.players, game.round);

        // TBD Aggiorna l'ordine dei giocatori nel DB 
        for (const player of sortedPlayers) {
            await GameService.updatePlayerState(gameId, player.username, { order: player.order });
        }

        // Ritorna l'ordine al frontend
        NotificationService.broadcastToRoom(io, roomId, 'playersOrdered', { players: sortedPlayers.sort((a, b) => a.order - b.order) });
        
        console.log("Giocatori ordinati inviati al frontend.");
    }catch (err) {
        console.error(`[Errore] handleOrderPlayers:`, err);
        socket.emit('lobbyError', { message: 'Errore ordinamento giocatori' });
    }
}


async function handleOrderPhaseComplete(io, socket) {
    const roomId = socket.data.roomId;

    try {
        // 1. Recupera il Game ID
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;


        // 2. Cambia fase a GAME (inizio_gioco)
        const updatedGame = await GameService.advancePhase(gameId, GamePhase.GAME);

        // 3. Costruisci il payload pubblico
        const payload = PayloadUtils.buildPublicGameData(updatedGame);

        // 4. Notifica TUTTI i giocatori del cambio fase
        NotificationService.broadcastToRoom(
            io,
            roomId,
            'phaseChanged',
            payload
        );

        console.log(`Game ${gameId} → Fase: ${GamePhase.GAME} (inizio_gioco)`);

    } catch (err) {
        console.error(`[Errore] handleOrderPhaseComplete:`, err);
        socket.emit('lobbyError', { message: 'Errore cambio fase' });
    }
}

async function handleConfirmWord(io,socket){ 
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    try {
        // 1. Recupera il Game ID
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) {
            console.log("❌ Game non trovato per room:", roomId);
            return;
        }
        let game = await GameService.getGameSnapshot(gameId);

        // Questo aggiorna solo il singolo giocatore su Redis e ritorna la lista aggiornata
        await GameService.updatePlayerState(gameId, username, { hasSpoken: true });

        NotificationService.broadcastToRoom(io, roomId, 'playerSpoken', {
            username: username,
            color: game.players.find(p => p.username === username)?.color
        });

        game = await GameService.getGameSnapshot(gameId);

        // Controlliamo se TUTTI hanno parlato
        if (GameService.checkAllPlayersSpoken(game.players)) {
            console.log(`[Game] Tutti hanno parlato in room ${roomId}. Fine fase parola!`);

            const updatedGame = await GameService.advancePhase(gameId, GamePhase.DISCUSSION); // Sostituisci con la fase successiva
            payload = PayloadUtils.buildPublicGameData(updatedGame);
            NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', payload);
        }
    } catch (err) {
        console.error(`[Errore] handleConfirmWord:`, err);
    }
}

async function handleDiscussionPhaseComplete(io, socket) {
    const roomId = socket.data.roomId;
    try {
        // 1. Recupera il Game ID
        const gameId = await Game.findGameIdByRoomId(roomId);  
        if (!gameId) {
            console.log("❌ Game non trovato per room:", roomId);
            return;
        }
        console.log(`[Socket] DiscussionPhaseComplete ricevuto in room ${roomId}`);
        // 2. Cambia fase a VOTING (votazione)
        const updatedGame = await GameService.advancePhase(gameId, GamePhase.VOTING);
        // 3. Costruisci il payload pubblico
        const payload = PayloadUtils.buildPublicGameData(updatedGame);
        // 4. Notifica TUTTI i giocatori del cambio fase
        NotificationService.broadcastToRoom(
            io,
            roomId,
            'phaseChanged',
            payload
        );
    } catch (err) {
        console.error(`[Errore] handleDiscussionPhaseComplete:`, err);
    }
}

function attach(socket, io) {
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
    socket.on('DiceRoll', () => handleRollDice(io, socket));
    socket.on('OrderPlayers', () => handleOrderPlayers(io, socket));
    socket.on('OrderPhaseComplete', () => handleOrderPhaseComplete(io, socket));
    socket.on('ConfirmWord', () => handleConfirmWord(io, socket));
    socket.on('DiscussionPhaseComplete', () => handleDiscussionPhaseComplete(io, socket));
}

module.exports = { attach };