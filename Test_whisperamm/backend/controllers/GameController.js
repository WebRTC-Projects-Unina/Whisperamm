// src/controllers/GameController.js
const RoomService = require('../services/roomService');
const GameService = require('../services/gameService');
const TimerService = require('../services/timerService');
const NotificationService = require('../services/notificationService');
const PayloadUtils = require('../utils/gamePayloadUtils');
const { GamePhase } = require('../models/Game');

class GameController {

    /**
     * =================================================================
     * 1. AVVIO DELLA PARTITA
     * =================================================================
     * Gestisce la transizione da Room (Lobby) a Game attivo.
     */
    static async handleStartGame(io, socket, { roomId }) {
        const { username } = socket.data;
        try {
            // 1. SICUREZZA: Verifica che chi chiama l'evento sia l'host della stanza
            const isHost = await RoomService.isUserHost(roomId, username);
            if (!isHost) return socket.emit('error', { message: 'Solo l\'admin può avviare la partita.' });

            // 2. CONTROLLO STATO: Evita di riavviare una partita già in corso
            const existingGame = await GameService.getGameSnapshotByRoomId(roomId);
            if (existingGame) return socket.emit('error', { message: 'La partita è già iniziata!' });

            console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);
            
            // 3. FEEDBACK IMMEDIATO: Notifica ai client di mostrare una schermata di caricamento
            NotificationService.broadcastToRoom(io, roomId, 'gameLoading', {});

            // 4. CREAZIONE DATI: Genera ruoli, segreti, colori e salva tutto su Redis
            const game = await GameService.createGame(roomId);
            
            // 5. BROADCAST PUBBLICO: Invia a tutti i dati visibili (nomi, colori, ma NON ruoli)
            const publicPayload = PayloadUtils.buildPublicGameData(game);
            NotificationService.broadcastToRoom(io, roomId, 'gameStarted', publicPayload);

            // 6. INVIO PRIVATO: Invia a ogni singolo socket il PROPRIO ruolo e segreto
            NotificationService.sendPersonalizedToRoom(io, roomId, game.players, 'identityAssigned',
                (player) => PayloadUtils.buildPrivateIdentity(player, game.secrets)
            );

            // 7. START PRIMA FASE (DADI): Avvia il timer di 5 secondi.
            // Se il timer scade, esegue la callback `forceRollsAndProceed`
            await TimerService.startTimedPhase(io, roomId, game.gameId, GamePhase.DICE, 5, async () => {
                await this.forceRollsAndProceed(io, roomId, game.gameId);
            });

        } catch (err) {
            console.error(`[Errore] handleStartGame:`, err);
            socket.emit('error', { message: err.message || 'Errore avvio partita' });
        }
    }

    /**
     * =================================================================
     * 2. FASE LANCIO DADI
     * =================================================================
     * I giocatori devono lanciare i dadi per determinare l'ordine di gioco.
     */

    // Gestisce il click del giocatore sul tasto "Lancia Dadi"
    static async handleRollDice(io, socket) {
        const { username, roomId } = socket.data;
        try {
            const gameId = await GameService.getGameIdByRoom(roomId); 
            if (!gameId) return;

            // 1. IDEMPOTENZA: Controlla se il giocatore ha già lanciato per evitare doppi click/cheat
            const player = await GameService.getPlayer(gameId, username);
            if (!player || player.hasRolled) return;

            // 2. AZIONE ATOMICA: Aggiorna lo stato del giocatore (dadi generati lato server)
            await this._performSingleRoll(io, roomId, gameId, username);

            // 3. CHECK COMPLETAMENTO: Se TUTTI hanno lanciato, non aspettiamo il timer, chiudiamo subito
            const allPlayers = await GameService.getPlayers(gameId);
            if (GameService.checkAllPlayersRolled(allPlayers)) {
                await this._finalizeDicePhase(io, roomId, gameId);
            }

        } catch (err) {
            console.error(`[Errore] handleRollDice:`, err);
        }
    }   

    // Callback chiamata se il Timer scade e qualcuno non ha lanciato i dadi
    static async forceRollsAndProceed(io, roomId, gameId) {
        try {
            // 1. FILTRO: Trova chi sta dormendo (idlePlayers)
            let players = await GameService.getPlayers(gameId);
            const idlePlayers = players.filter(p => !p.hasRolled);
            
            // 2. PARALLELISMO: Esegue il lancio forzato per tutti gli inattivi simultaneamente
            const promises = idlePlayers.map(p => 
                this._performSingleRoll(io, roomId, gameId, p.username)
            );

            await Promise.all(promises);
            
            // 3. CHIUSURA: Ora che tutti hanno lanciato, procediamo
            await this._finalizeDicePhase(io, roomId, gameId);

        } catch (err) {
            console.error("Errore in forceRollsAndProceed:", err);
        }
    }

    // --- PRIVATE HELPERS DADI ---

    // Esegue logicamente il lancio: salva su Redis, notifica la stanza
    static async _performSingleRoll(io, roomId, gameId, username) {
        // updatePlayerState qui scatenerà internamente la logica di generazione numeri se non passati esplicitamente (dipende dal service)
        // O semplicemente segna hasRolled: true se i numeri erano già pre-calcolati alla creazione.
        const updatedPlayer = await GameService.updatePlayerState(gameId, username, { hasRolled: true });
        
        NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
            username: username,
            dice1: updatedPlayer.dice1,
            dice2: updatedPlayer.dice2,
            color: updatedPlayer.color
        });
    }

    // Pulisce il timer dei dadi e introduce una piccola pausa (4s) per far vedere le animazioni prima di cambiare fase
    static async _finalizeDicePhase(io, roomId, gameId) {
        TimerService.clearTimer(roomId);
        setTimeout(async () => {
            await this.startTurnAssignmentPhase(io, roomId, gameId);
        }, 4000);
    }


    /**
     * =================================================================
     * 3. FASE ASSEGNAZIONE TURNI (Sorting)
     * =================================================================
     * Determina chi inizia a parlare in base ai risultati dei dadi e salva il risultato
     */
    static async startTurnAssignmentPhase(io, roomId, gameId) {
        try {
            console.log(`[Game] Cambio fase TURN_ASSIGNMENT per ${roomId}`);

            // 1. Il Service fa calcoli e salvataggi database.
            const sortedPlayers = await GameService.assignTurnOrder(gameId);

           // 2. Avvia timer grafico
            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.TURN_ASSIGNMENT, 5, 
                async () => {  // CALLBACK DI FINE TIMER:
                    // A. Il Service prepara i dati (CurrentTurnIndex=0 e Phase=GAME)
                    await GameService.prepareGamePhase(gameId);
                    // B. Il Controller avvia il flusso dei turni
                    await this.startNextTurn(io, roomId, gameId); 
                }, 
                
                { players: sortedPlayers } // Payload visuale
            );

        } catch (err) {
            console.error("Errore TURN_ASSIGNMENT:", err);
        }
    }

    /*
     * =================================================================
     * 4. CICLO DI GIOCO (Microfono / Parola)
     * =================================================================
     * Gestisce il passaggio del turno da un giocatore all'altro.
     */
    
    static async startNextTurn(io, roomId, gameId) {
        try {
            // 1. CHIEDI AL SERVICE: "Qual è la situazione?"
            const turnState = await GameService.getCurrentTurnStatus(gameId);

            // 2. RAMO A: GIRO FINITO
            if (turnState.status === 'ROUND_OVER') {
                TimerService.clearTimer(roomId);
                
                // Avvia fase DISCUSSIONE
                await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.DISCUSSION, 5, 
                    async () => { await this.startVotingPhase(io, roomId, gameId); }
                );
                return;
            }

            // 3. RAMO B: TOCCA A UN GIOCATORE
            // Il service ci ha già dato l'oggetto player pulito
            const { player, index } = turnState;

            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.GAME, 5, async () => {
                // Timeout: forza passaggio turno
                await this.advanceTurnLogic(io, roomId, gameId, player.username); 
            }, { currentTurnIndex: index }); 

        } catch (err) {
            console.error("Errore startNextTurn:", err);
        }
    }
    // Gestisce la conferma manuale del giocatore ("Ho detto la parola")
    static async handleConfirmWord(io, socket) {
        const { roomId, username } = socket.data;
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;
            
            let game = await GameService.getGameSnapshot(gameId);
            const currentIndex = game.currentTurnIndex || 0;
            
            // ANTI-CHEAT: Verifica che chi chiama l'API sia davvero il giocatore di turno
            if (game.players[currentIndex].username !== username) {
                console.warn(`[Cheat] ${username} fuori turno!`);
                return; 
            }

            // Cancella il timer automatico perché l'utente ha finito prima
            TimerService.clearTimer(roomId);
            // Passa al prossimo
            await this.advanceTurnLogic(io, roomId, gameId, username);

        } catch (err) {
            console.error(`[Errore] handleConfirmWord:`, err);
        }
    }

    // Logica comune per chiudere un turno (chiamata da Timeout o da Conferma Manuale)
    static async advanceTurnLogic(io, roomId, gameId, username) {
        // 1. STATO: Segna che l'utente ha parlato
        await GameService.updatePlayerState(gameId, username, { hasSpoken: true });
        
        // 2. INCREMENTO: Sposta l'indice in avanti per il prossimo ciclo
        const game = await GameService.getGameSnapshot(gameId); // Refresh per sicurezza
        const nextIndex = (game.currentTurnIndex || 0) + 1;
        await GameService.updateMetaField(gameId, 'currentTurnIndex', nextIndex);

        // 3. NOTIFICA: Dice ai client chi ha appena finito
        NotificationService.broadcastToRoom(io, roomId, 'playerSpoken', { username, nextIndex });
        
        // 4. RICORSIONE: Richiama startNextTurn che valuterà il nuovo indice (Next Player o Fine Giro)
        await this.startNextTurn(io, roomId, gameId);
    }


    /**
     * =================================================================
     * 5. FASE VOTAZIONE
     * =================================================================
     */
    static async startVotingPhase(io, roomId, gameId) {
        // Avvia un timer lungo (60s) per permettere il voto.
        // Se scade, forza la fine dei voti (chi non ha votato si astiene/vota nullo).
        await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.VOTING, 60, async () => {
            await this.forceVoteCompletion(io, roomId, gameId);
        });
    }

    static async handleVoteReceived(io, socket, payload) {
        const { roomId, username } = socket.data;
        const { voteFor } = payload; // Username del sospettato
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;

            // Registra il voto su Redis (incrementa counter del sospettato, setta hasVoted del votante)
            const success = await GameService.registerVote(gameId, username, voteFor);
            if (!success) return; // Forse aveva già votato

            // Notifica anonima ("Qualcuno ha votato") o esplicita in base alle regole
            NotificationService.broadcastToRoom(io, roomId, 'playerVoted', { username, hasVoted: true });
            
            // CHECK VELOCE: Se tutti i VIVI hanno votato, non aspettiamo i 60 secondi
            const game = await GameService.getGameSnapshot(gameId);
            if (GameService.checkAllAlivePlayersVoted(game.players)) {
                TimerService.clearTimer(roomId);
                await this.proceedToResults(io, roomId, gameId);
            }
        } catch (err) {
            console.error("Errore handleVoteReceived:", err);
        }
    }

    // Chiamata dal Timer se scade il tempo votazione
    static async forceVoteCompletion(io, roomId, gameId) {
        try {
            let game = await GameService.getGameSnapshot(gameId);
            // Trova chi non ha votato
            const idlePlayers = game.players.filter(p => p.isAlive && !p.hasVoted);
            // Registra un voto nullo (null) per loro
            const forcePromises = idlePlayers.map(p => GameService.registerVote(gameId, p.username, null));
            await Promise.all(forcePromises);
            
            // Calcola i risultati
            await this.proceedToResults(io, roomId, gameId);
        } catch (err) {
            console.error("Errore forceVoteCompletion:", err);
        }
    }


    /**
     * =================================================================
     * 6. CALCOLO RISULTATI E FINE ROUND
     * =================================================================
     */
    static async proceedToResults(io, roomId, gameId) {
        try {
            // 1. ELIMINAZIONE: Chi ha preso più voti muore (aggiorna isAlive su Redis)
            const resultData = await GameService.processVotingResults(gameId);
            
            // 2. WIN CONDITION: Controlla se Impositori o Civili hanno vinto
            const winStatus = await GameService.checkWinCondition(gameId);
            
            const resultsPayload = {
                lastRoundResult: resultData, // Chi è morto
                gameOver: winStatus.isGameOver,
                winner: winStatus.winner,
                cause: winStatus.cause
            }

            // 3. MOSTRA RISULTATI: Fase 'RESULTS' di 5 secondi per mostrare l'animazione dell'eliminazione
            await TimerService.startTimedPhase(io, roomId, gameId, 'RESULTS', 5, async () => {
                
                if (winStatus.isGameOver) {
                    // --- RAMO A: PARTITA FINITA ---
                    await GameService.updateMetaField(gameId, 'phase', 'FINISH');
                    NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', {
                        phase: 'FINISH',
                        winner: winStatus.winner,
                        cause: winStatus.cause,
                        players: (await GameService.getGameSnapshot(gameId)).players 
                    });
                } else {
                    // --- RAMO B: NUOVO ROUND ---
                    // Incrementa numero round, resetta flag (hasVoted, hasSpoken, etc.)
                    await GameService.startNewRound(gameId);
                    
                    // RICOMINCIA IL CICLO: Torna alla fase di assegnazione turni (riordinamento in base ai dadi se necessario, o fisso)
                    await this.startTurnAssignmentPhase(io, roomId, gameId);
                }
            }, resultsPayload);

        } catch (err) {
            console.error("Errore proceedToResults:", err);
        }
    }
}

module.exports = GameController;