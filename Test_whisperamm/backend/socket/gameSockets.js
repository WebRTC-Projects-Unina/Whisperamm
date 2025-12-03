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
        roomId,         // 2. roomId 
        'gameStarted',  // 3. eventName 
        gamePayload     // 4. payload 
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
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;

        // 1. Reset/Inizializzazione Fase
        await GameService.updateMetaField(gameId, 'phase', GamePhase.GAME);
        await GameService.updateMetaField(gameId, 'currentTurnIndex', 0); // Inizia dal primo giocatore

        // Avvia il primo turno
        await startNextTurn(io, roomId, gameId);

    } catch (err) {
        console.error(`[Errore] handleOrderPhaseComplete:`, err);
    }
}

async function handleConfirmWord(io, socket){ 
    const roomId = socket.data.roomId;
    const username = socket.data.username;

    try {
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;
        
        // 1. Controllo: È davvero il suo turno? (Anti-Cheat)
        let game = await GameService.getGameSnapshot(gameId);
        const sortedPlayers = game.players.sort((a, b) => a.order - b.order);
        const currentIndex = game.currentTurnIndex || 0;
        
        if (sortedPlayers[currentIndex].username !== username) {
            console.warn(`[Cheat] ${username} ha provato a confermare fuori turno!`);
            return; 
        }

        // 2. STOP AL TIMER CORRENTE!
        // Fondamentale: fermiamo il conto alla rovescia di 30s perché ha finito prima.
        TimerService.clearTimer(roomId);

        console.log(`[Game] ${username} ha confermato manualmente.`);

        // 3. Esegui avanzamento
        await advanceTurnLogic(io, roomId, gameId, username);

    } catch (err) {
        console.error(`[Errore] handleConfirmWord:`, err);
    }
}

/**
 * Gestisce il flusso dei turni nella fase PAROLA (GAME).
 * Controlla l'indice corrente: se c'è un giocatore, avvia il suo timer.
 * Se sono finiti, passa alla Discussione.
 */
async function startNextTurn(io, roomId, gameId) {
    try {
        let game = await GameService.getGameSnapshot(gameId);
        // Recuperiamo l'indice corrente 
        let currentIndex = game.currentTurnIndex || 0;
        
        // Ordiniamo i giocatori (come nel frontend) per sapere a chi tocca
        const sortedPlayers = game.players.sort((a, b) => a.order - b.order);

        // --- CASO A: FASE FINITA (Tutti hanno parlato) ---
        if (currentIndex >= sortedPlayers.length) {
            
            // Pulisci timer vecchi per sicurezza
            TimerService.clearTimer(roomId);

            // Avvia fase DISCUSSIONE (60 secondi)
            await TimerService.startTimedPhase(
                io, roomId, gameId, 
                GamePhase.DISCUSSION, 
                60, 
                async () => {
                    console.log(`[Timer] Discussione finita in ${roomId}.`);
                    await handleDiscussionPhaseComplete(io, { data: { roomId } });
                }
            );
            return;
        }

        // --- CASO B: TOCCA A UN GIOCATORE ---
        const currentPlayer = sortedPlayers[currentIndex];

        // Avviamo il timer per QUESTO turno specifico (es. 30 secondi)
        // Nota: Usiamo ancora 'phaseChanged' o un evento specifico 'turnUpdate'
        // Per semplicità usiamo startTimedPhase che aggiorna il tempo per tutti
        await TimerService.startTimedPhase(
            io,
            roomId,
            gameId,
            GamePhase.GAME, // Rimaniamo in fase GAME
            30, // 30 secondi per dire la parola
            async () => {
                // TIMEOUT: Se il giocatore non conferma, il server lo fa per lui
                console.log(`[Timer] Tempo parola scaduto per ${currentPlayer.username}. Auto-skip.`);
                
                // Forziamo l'avanzamento chiamando handleConfirmWord "finto"
                // o chiamando direttamente la logica di avanzamento
                await advanceTurnLogic(io, roomId, gameId, currentPlayer.username); 
            },
            { currentTurnIndex: currentIndex }
        );

    } catch (err) {
        console.error("Errore in startNextTurn:", err);
    }
}

/**
 * Logica atomica per segnare che un player ha parlato e incrementare l'indice.
 * Usata sia dal click manuale che dal timeout.
 */
async function advanceTurnLogic(io, roomId, gameId, username) {
    // 1. Segna che ha parlato
    await GameService.updatePlayerState(gameId, username, { hasSpoken: true });
    
    // 2. Incrementa l'indice del turno su Redis
    // Dobbiamo recuperare l'indice attuale e fare +1
    const game = await GameService.getGameSnapshot(gameId);
    const nextIndex = (game.currentTurnIndex || 0) + 1;
    await GameService.updateMetaField(gameId, 'currentTurnIndex', nextIndex);

    // 3. Notifica visiva (opzionale, per far vedere la spunta verde istantanea)
    NotificationService.broadcastToRoom(io, roomId, 'playerSpoken', { 
        username, 
        nextIndex // Utile al frontend per sapere chi tocca
    });

    // 4. Passa al prossimo (ricorsione logica)
    await startNextTurn(io, roomId, gameId);
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