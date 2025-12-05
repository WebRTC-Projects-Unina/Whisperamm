// src/socket/gameSocket.js
const RoomService = require('../services/roomService');
const GameService = require('../services/gameService');
const TimerService = require('../services/timerService');
const NotificationService = require('../services/notificationService'); // Nota la maiuscola se il file è maiuscolo
const PayloadUtils = require('../utils/gamePayloadUtils');
const { Game, GamePhase } = require('../models/Game');


async function handleStartGame(io, socket, { roomId }) {
    const { username } = socket.data;

    try {
        // 1. VALIDAZIONE
        // Controllo permessi Host
        const isHost = await RoomService.isUserHost(roomId, username);
        if (!isHost) {
            return socket.emit('error', { message: 'Solo l\'admin può avviare la partita.' });
        }

        // (Opzionale) Controllo se partita esiste già per evitare doppi click
        const existingGame = await GameService.getGameSnapshotByRoomId(roomId);
        if (existingGame) {
            return socket.emit('error', { message: 'La partita è già iniziata!' });
        }

        console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);

        // 2. TRIGGER LOADING (UX)
        // Utile per far apparire uno spinner mentre il server macina
        NotificationService.broadcastToRoom(io, roomId, 'gameLoading', {});

        // 3. CREAZIONE PARTITA (Business Logic pura)
        const game = await GameService.createGame(roomId);

        // 4. INVIO DATI AL FRONTEND
        
        // A. Dati Pubblici (Fase, Round, Ordine turni, Chi è vivo)
        // Cambiato evento da 'parametri' a 'gameStarted'
        const publicPayload = PayloadUtils.buildPublicGameData(game);
        NotificationService.broadcastToRoom(io, roomId, 'gameStarted', publicPayload);

        // B. Dati Privati (Identità e Parola segreta)
        // Usa la tua funzione sendPersonalizedToRoom
        NotificationService.sendPersonalizedToRoom(
            io,
            roomId,
            game.players,
            'identityAssigned',
            (player) => PayloadUtils.buildPrivateIdentity(player, game.secrets) //Ho letteralmente passato una funzione.
        );

        // 5. AVVIO TIMER FASE DADI
        // Logica: Avvia timer -> Se scade, chiama la funzione di timeout
        await TimerService.startTimedPhase(
            io, 
            roomId, 
            game.gameId, 
            GamePhase.DICE, 
            5, // 30 Secondi
            async () => {
                await forceRollsAndProceed(io,roomId,game.gameId)
            }
        );

    } catch (err) {
        console.error(`[Errore] handleStartGame:`, err);
        socket.emit('error', { 
            message: err.message || 'Errore critico avvio partita' 
        });
    }
}

/**
 * Funzione helper per passare alla fase TURN_ASSIGNMENT.
 * Viene chiamata o dal Timer (se scade) o da handleRollDice (se finiscono prima) o nel caso di round > 1.
 */
async function startTurnAssignmentPhase(io, roomId, gameId) {
    try {
        console.log(`[Game] Calcolo ordine e cambio fase a TURN_ASSIGNMENT per ${roomId}`);

        // Recupera stato
        let game = await GameService.getGameSnapshot(gameId);
        

        //Ma non so se servono dato che se non erro ordino sia quando creo che quando vado a fare la getSnapshot..
        // Calcola ordine (Round Robin o Dadi)
        const sortedPlayers = GameService.sortPlayersByDice(game.players, game.currentRound); //Ma sai che forse riordiniamo più volte?..
        // Salva ordine su Redis
        const updatePromises = sortedPlayers.map((p, index) => 
            GameService.updatePlayerState(gameId, p.username, { order: index + 1 })
        ); 
        await Promise.all(updatePromises);


        // 4. Avvia Fase e Timer (15s per vedere classifica)
        await TimerService.startTimedPhase(
            io,
            roomId,
            gameId,
            GamePhase.TURN_ASSIGNMENT, 
            5, 
            async () => {
                console.log(`[Timer] Fine visione classifica in ${roomId}.`);
                await handleOrderPhaseComplete(io, { data: { roomId } }); //Qui mi sa che chiamarlo handle è un pò sbagliato dato che non reagisce a nulla dalla socket
                //Viene semplicemente chiamato da noi
            },
            { players: sortedPlayers }
        );
    } catch (err) {
        console.error("Errore nel passaggio a TURN_ASSIGNMENT:", err);
    }
}

/**
 * 
 * Funzione chiamata dalla socket alla ricezione di un emit su rollDice
 * gestisce il cambio di fase attendendo che tutti lancino i dadi
 */
async function handleRollDice(io, socket) {
    const username = socket.data.username;
    const roomId = socket.data.roomId; 
    //ma perchè gli arriva il roomId? Boh non lo mandiamo mai..

    try {
        // Recupera Game ID
        const gameId = await Game.findGameIdByRoomId(roomId); //Dio porco
        if (!gameId) return;

        // RECUPERIAMO IL GIOCO AGGIORNATO (che ora include il hasRolled: true appena messo)
        let game = await GameService.getGameSnapshot(gameId); 
        //Anche se forse non serve recuperare tutto lo snapshot, ma solo il player no?

        // Inviamo il risultato a tutti (Broadcast)
        const myData = game.players.find(p => p.username === username);

        // Ignora se ha già lanciato, in teoria è gestita dal frontend ma per sicurezza
        if (myData.hasRolled) {return; }

        // Questo aggiorna solo il singolo giocatore su Redis e ritorna la lista aggiornata
        await GameService.updatePlayerState(gameId, username, { hasRolled: true }); 
        //Qua lavoriamo con PlayerDataModel ed è buono però per ora playerdata model non ha la creazione, che avviene nel Game Model..
        
        NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
            username: username,
            dice1: myData.dice1,
            dice2: myData.dice2,
            color: myData.color
        });
        
        // Recupera di nuovo lo stato del gioco aggiornato
        game = await GameService.getGameSnapshot(gameId); 
        //Forse più che lo stato dell'intero gioco qui potremmo recuperare anche lo stato dei player
        // Controlliamo se TUTTI hanno lanciato
        if (GameService.checkAllPlayersRolled(game.players)) { 

            TimerService.clearTimer(roomId);
            // Attendo 4 secondi per l'animazione dei dadi
            setTimeout(async () => {
                await startTurnAssignmentPhase(io, roomId, gameId);
            }, 4000) //Perchè qui non l'abbiamo fatto con TimerService?
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
        
        // Attendo 4 secondi per l'animazione dei dadi
        setTimeout(async () => {
            await startTurnAssignmentPhase(io, roomId, gameId);
        }, 4000)
    } catch (err) {
        console.error("Errore in forceRollsAndProceed:", err);
    }
}

//Non mi piace che ci sia una funzione, tra l'altro penso che il gioco non sia mai passato in ORDER Phase a questo punto
//Che è ok, però non ho completato orderPhase ma ho completato dice!
async function handleOrderPhaseComplete(io, socket) { //Forse non va bene come nome
    const roomId = socket.data.roomId; 

    try {
        const gameId = await Game.findGameIdByRoomId(roomId); //qui proprio è una porcheria
        if (!gameId) return;

        // 1. Reset/Inizializzazione Fase forse qua ci vorrebbe qualcosa nel service..
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
async function startNextTurn(io, roomId, gameId) { //Mi sa che va in gameService, oppure in un file che riguarda solo la logica di gioco
    try {
        let game = await GameService.getGameSnapshot(gameId);
        // Recuperiamo l'indice corrente 
        let currentIndex = game.currentTurnIndex || 0;
        
        // Ordiniamo i giocatori (come nel frontend) per sapere a chi tocca
        const sortedPlayers = game.players.sort((a, b) => a.order - b.order);
        //Natavot..

        // --- CASO A: FASE FINITA (Tutti hanno parlato) ---
        if (currentIndex >= sortedPlayers.length) {
            
            // Pulisci timer vecchi per sicurezza
            TimerService.clearTimer(roomId);

            // Avvia fase DISCUSSIONE (60 secondi)
            await TimerService.startTimedPhase(
                io, roomId, gameId, 
                GamePhase.DISCUSSION, 
                5, //Metti 30 secondi 
                async () => {
                    console.log(`[Timer] Discussione finita in ${roomId}.`);
                    await startVotingPhase(io, roomId, gameId);
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
            5, // 30 secondi per dire la parola
            async () => {
                // TIMEOUT: Se il giocatore non conferma, il server lo fa per lui
                console.log(`[Timer] Tempo parola scaduto per ${currentPlayer.username}. Auto-skip.`);
                
                // Forziamo l'avanzamento chiamando handleConfirmWord "finto"
                // o chiamando direttamente la logica di avanzamento
                await advanceTurnLogic(io, roomId, gameId, currentPlayer.username); 
                //Questo mi sa che in realtà va in gameService..
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
async function advanceTurnLogic(io, roomId, gameId, username) { //Mi sa che va in game service
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

// Funzione da chiamare quando inizia la fase votazione (dalla Discussione)
async function startVotingPhase(io, roomId, gameId) {
    await TimerService.startTimedPhase(
        io, roomId, gameId,
        GamePhase.VOTING,
        60, // Timer di Sicurezza
        async () => {
            // Se scade, forziamo la chiusura
            await forceVoteCompletion(io, roomId, gameId);
        }
    );
}

//---------------------------- FASE VOTAZIONE -----------------------------

/**
 * Chiamata quando scade il tempo massimo per votare.
 * Forza uno SKIP per chi non ha votato e calcola i risultati.
 */
async function forceVoteCompletion(io, roomId, gameId) {
    try {
        let game = await GameService.getGameSnapshot(gameId);
        // Trova chi si è addormentato
        const idlePlayers = game.players.filter(p => p.isAlive && !p.hasVoted);
        // Assegna voto NULL (Skip) agli inattivi
        const forcePromises = idlePlayers.map(p => 
            GameService.registerVote(gameId, p.username, null) // null = Skip/Astensione
        );
        await Promise.all(forcePromises);
        // Ora che "tutti" hanno votato (o sono stati forzati), calcoliamo
        await proceedToResults(io, roomId, gameId);
    } catch (err) {
        console.error("Errore forceVoteCompletion:", err);
    }
}

/**
 * Calcola risultati e passa alla fase RESULTS.
 * Usata sia se finiscono tutti, sia se scade il tempo.
 */
async function proceedToResults(io, roomId, gameId) {
    try {
        // Calcola chi muore e aggiorna lo stato "isAlive"
        const resultData = await GameService.processVotingResults(gameId);
        // CONTROLLO VITTORIA (Subito dopo l'eliminazione)
        const winStatus = await GameService.checkWinCondition(gameId);
        // Arricchiamo il payload dei risultati con lo stato della vittoria
        // Così il frontend sa se mostrare "Prossimo Round" o "Partita Finita"
        const resultsPayload = {
            lastRoundResult: resultData,
            gameOver: winStatus.isGameOver,
            winner: winStatus.winner,
            cause: winStatus.cause
        }

        // Avvia fase RISULTATI (15 secondi per vedere chi è morto)
        await TimerService.startTimedPhase(
            io, roomId, gameId,
            'RESULTS', 
            5, 
            async () => {
                if (winStatus.isGameOver) {
                    // --- CASO A: PARTITA FINITA ---
                    // Passa alla fase finale (senza timer o con timer per tornare alla lobby)
                    await GameService.updateMetaField(gameId, 'phase', 'FINISH');
                    
                    NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', {
                        phase: 'FINISH',
                        winner: winStatus.winner,
                        cause: winStatus.cause,
                        players: (await GameService.getGameSnapshot(gameId)).players // Manda stato finale
                    });

                    // (Opzionale) Qui potresti pulire la stanza o disconnettere dopo X minuti
                } else {
                    // --- CASO B: SI CONTINUA ---
                    // Reset del gioco per il prossimo round
                    await GameService.startNewRound(gameId);
                    // Vai subito all'assegnazione ordine
                    await startTurnAssignmentPhase(io, roomId, gameId);
                }
            },
            resultsPayload // Passiamo i dati (eliminato + eventuale vittoria) al frontend
        );

    } catch (err) {
        console.error("Errore proceedToResults:", err);
    }
}


async function handleVoteReceived(io, socket, payload) {
    const { roomId, username } = socket.data;
    const { voteFor } = payload; // Può essere 'NomeGiocatore' o null (Astensione)

    try {
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return;
        // Registra Voto nel DB
        const success = await GameService.registerVote(gameId, username, voteFor);
        if (!success) return; // Aveva già votato, ignoriamo

        // Diciamo a tutti che questo utente ha votato, così la sidebar si aggiorna subito
        NotificationService.broadcastToRoom(io, roomId, 'playerVoted', {
            username: username,
            hasVoted: true
        });
        // Controllo se i vivi hanno votato
        const game = await GameService.getGameSnapshot(gameId); //Pure qua..forse mi servirebbe semplicemente players..
        
        if (GameService.checkAllAlivePlayersVoted(game.players)) {
            console.log(`[Vote] Tutti hanno votato manualmente in ${roomId}.`);
            // Fermo il timer
            TimerService.clearTimer(roomId);
            // Procedi ai risultati
            await proceedToResults(io, roomId, gameId);
        }

    } catch (err) {
        console.error("Errore handleVoteReceived:", err);
    }
}



function attach(socket, io) {
    socket.on('startGame', (payload) => handleStartGame(io, socket, payload));
    socket.on('DiceRoll', () => handleRollDice(io, socket));
    socket.on('ConfirmWord', () => handleConfirmWord(io, socket));
    socket.on('Vote', (payload) => handleVoteReceived(io, socket, payload));
}

module.exports = { attach };