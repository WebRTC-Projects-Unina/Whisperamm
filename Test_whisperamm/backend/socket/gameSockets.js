// src/socket/gameSocket.js
const RoomService = require('../services/roomService');
const GameService = require('../services/gameService');
const TimerService = require('../services/timerService');
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

        // GG: Inizia la sincronizzazione centralizzata, quindi i player hanno 15 secondi
        // per lanciare i dadi in autonomia altrimenti è automatico
        await TimerService.startTimedPhase(
            io, 
            roomId, 
            game.gameId, 
            GamePhase.DICE, 
            30, // 30 Secondi
            async () => {
                // CALLBACK TIMEOUT: Se nessuno clicca, il server forza i lanci
                console.log(`[Timer] Scaduto fase DICE in ${roomId}.`);
                await forceRollsAndProceed(io, roomId, game.gameId);
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

/**
 * Funzione helper per passare alla fase TURN_ASSIGNMENT.
 * Viene chiamata o dal Timer (se scade) o da handleRollDice (se finiscono prima).
 */
async function startTurnAssignmentPhase(io, roomId, gameId) {
    // Faccio attendere 4 secondi per l'animazione dei dadi e poi aggiorno lo stato
    setTimeout(async () => {
        try {
            // Per passare alla fase di TurnAssignment conviene passare qui l'ordinamento dei players
            // in questo modo lo facciamo una volta sola per tutti
            let game = await GameService.getGameSnapshot(gameId);
            const sortedPlayers = GameService.sortPlayersByDice(game.players, game.round);
            
            const updatePromises = sortedPlayers.map((p) => 
                GameService.updatePlayerState(
                    gameId, 
                    p.username, 
                    { order: p.order} 
                )
            );
            await Promise.all(updatePromises);

            // AVVIA TIMER DI FASE
            await TimerService.startTimedPhase(
                io,
                roomId,
                gameId,
                GamePhase.TURN_ASSIGNMENT, // Fase
                15, // Durata visualizzazione classifica
                async () => {
                    // Chiama la funzione che gestisce la prossima fase
                    await handleOrderPhaseComplete(io, { data: { roomId } });
                }
            );
        } catch (err) {
            console.error("Errore nel passaggio a TURN_ASSIGNMENT:", err);
        }
    }, 4000);
}

/**
 * 
 * Funzione chiamata dalla socket alla ricezione di un emit su rollDice
 * gestisce il cambio di fase attendendo che tutti lancino i dadi
 */
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
            // Fondamentale altrimenti tra X secondi scatta il timeout e prova a cambiare fase di nuovo.
            TimerService.clearTimer(roomId);
            await startTurnAssignmentPhase(io, roomId, gameId);
        }

    } catch (err) {
        console.error(`[Errore] handleRollDice:`, err);
    }
}

/**
 * Funzione chiamata quando scade il timer della fase Dadi.
 * Forza il lancio per chi si è coccato e poi cambia fase.
 */
async function forceRollsAndProceed(io, roomId, gameId) {
    try {
        let game = await GameService.getGameSnapshot(gameId);
        // Cerco chi ancora deve lanciare il dado 
        const idlePlayers = game.players.filter(p => !p.hasRolled);
        // Per ognuno simuliamo il lancio
        // Usiamo un loop map per fare le update in parallelo (o for..of)
        const promises = idlePlayers.map(async (player) => {
            // Aggiorna su Redis (hasRolled: true)
            const updatedPlayer = await GameService.updatePlayerState(gameId, player.username, { hasRolled: true });
            
            // Emettiamo lo stesso evento di quando uno clicca.
            // Il frontend riceverà questo e farà partire l'animazione 3D.
            NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
                username: player.username,
                dice1: updatedPlayer.dice1,
                dice2: updatedPlayer.dice2,
                color: updatedPlayer.color
            });
        });

        await Promise.all(promises);
        
        //Passiamo alla fase successiva, il delay per l'animazione lo gestiamo in startTurnAssignmentPhase
        await startTurnAssignmentPhase(io, roomId, gameId);
        
    } catch (err) {
        console.error("Errore in forceRollsAndProceed:", err);
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
            return;
        }
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
    socket.on('ConfirmWord', () => handleConfirmWord(io, socket));
    socket.on('DiscussionPhaseComplete', () => handleDiscussionPhaseComplete(io, socket));
}

module.exports = { attach };