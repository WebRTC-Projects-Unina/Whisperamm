// src/controllers/GameController.js
const RoomService = require('../services/roomService');
const GameService = require('../services/gameService');
const TimerService = require('../services/timerService');
const NotificationService = require('../services/notificationService');
const PayloadUtils = require('../utils/gamePayloadUtils');
const { GamePhase } = require('../models/Game');

//NOTA: Togliere dal TimerService il compito di mandare messaggi!

class GameController {

    static async handleStartGame(io, socket, { roomId }) {
        const { username } = socket.data;
        try {
            const isHost = await RoomService.isUserHost(roomId, username);
            if (!isHost) return socket.emit('error', { message: 'Solo l\'admin può avviare la partita.' });

            const existingGame = await GameService.getGameSnapshotByRoomId(roomId);
            if (existingGame) return socket.emit('error', { message: 'La partita è già iniziata!' });

            console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);
            NotificationService.broadcastToRoom(io, roomId, 'gameLoading', {});

            const game = await GameService.createGame(roomId);
            
            const publicPayload = PayloadUtils.buildPublicGameData(game);
            NotificationService.broadcastToRoom(io, roomId, 'gameStarted', publicPayload);

            NotificationService.sendPersonalizedToRoom(io, roomId, game.players, 'identityAssigned',
                (player) => PayloadUtils.buildPrivateIdentity(player, game.secrets)
            );

            await TimerService.startTimedPhase(io, roomId, game.gameId, GamePhase.DICE, 5, async () => {
                await this.forceRollsAndProceed(io, roomId, game.gameId);
            });

        } catch (err) {
            console.error(`[Errore] handleStartGame:`, err);
            socket.emit('error', { message: err.message || 'Errore avvio partita' });
        }
    }

    // --- FASE DADI (OTTIMIZZATA) ---

    static async handleRollDice(io, socket) {
        const { username, roomId } = socket.data;
        try {
            const gameId = await GameService.getGameIdByRoom(roomId); 
            if (!gameId) return;

            // 1. Controllo Idempotenza (Veloce)
            const player = await GameService.getPlayer(gameId, username);
            if (!player || player.hasRolled) return;

            // 2. Esegui il lancio atomico (Helper)
            await this._performSingleRoll(io, roomId, gameId, username);

            // 3. Controlla se hanno finito tutti (Leggendo solo i players)
            const allPlayers = await GameService.getPlayers(gameId);
            if (GameService.checkAllPlayersRolled(allPlayers)) {
                await this._finalizeDicePhase(io, roomId, gameId);
            }

        } catch (err) {
            console.error(`[Errore] handleRollDice:`, err);
        }
    }   

    static async forceRollsAndProceed(io, roomId, gameId) {
        try {
            // Recupera solo la lista giocatori
            let players = await GameService.getPlayers(gameId);
            const idlePlayers = players.filter(p => !p.hasRolled);
            
            // Esegue i lanci mancanti in parallelo
            const promises = idlePlayers.map(p => 
                this._performSingleRoll(io, roomId, gameId, p.username)
            );

            await Promise.all(promises);
            
            // Qui non serve ricontrollare, abbiamo forzato la fine.
            await this._finalizeDicePhase(io, roomId, gameId);

        } catch (err) {
            console.error("Errore in forceRollsAndProceed:", err);
        }
    }

    // --- PRIVATE HELPERS ---

    // Aggiorna DB e invia notifica Socket
    static async _performSingleRoll(io, roomId, gameId, username) {
        const updatedPlayer = await GameService.updatePlayerState(gameId, username, { hasRolled: true });
        
        NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
            username: username,
            dice1: updatedPlayer.dice1,
            dice2: updatedPlayer.dice2,
            color: updatedPlayer.color
        });
    }

    // Ferma timer e transiziona alla prossima fase dopo animazione
    static async _finalizeDicePhase(io, roomId, gameId) {
        TimerService.clearTimer(roomId);
        setTimeout(async () => {
            await this.startTurnAssignmentPhase(io, roomId, gameId);
        }, 4000);
    }

    // --- FINE FASE DADI ---


    //FASE TURN ASSIGNMENT
    static async startTurnAssignmentPhase(io, roomId, gameId) {
        try {
            console.log(`[Game] Cambio fase TURN_ASSIGNMENT per ${roomId}`);
            let players = await GameService.getPlayers(gameId);
            
            //Bisogna riordinare ad ogni round, dato che se ci sono eliminazioni bisogna rivedere l'ordine
            const sortedPlayers = GameService.sortPlayersByDice(players, gameId.currentRound); 
           
            const updatePromises = sortedPlayers.map((p, index) => 
                GameService.updatePlayerState(gameId, p.username, { order: index + 1 })
            );
            await Promise.all(updatePromises);
            
            
            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.TURN_ASSIGNMENT, 5, 
                async () => {await this.orderPhaseCompleted(io, roomId);}, { players: sortedPlayers });
                //La async è la callback passata che deve semplicemente far passare alla fase di Game.

        } catch (err) {
            console.error("Errore TURN_ASSIGNMENT:", err);
        }
    }

    //Qui semplicemente settiamo il current Turn Index a 0 e si parte in GAME
    static async orderPhaseCompleted(io, roomId) {
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;

            await GameService.updateMetaField(gameId, 'phase', GamePhase.GAME);
            await GameService.updateMetaField(gameId, 'currentTurnIndex', 0); 
            //Forse tutta sta parte poteva essere messa in un service..per essere fatta in maniera transazionale.

            await this.startNextTurn(io, roomId, gameId);
        } catch (err) {
            console.error(`[Errore] orderPhaseComplete:`, err);
        }
    }


    //FASE DI SWITCH Del microfono praticamente.
    static async startNextTurn(io, roomId, gameId) {
        try {
            let game = await GameService.getGameSnapshot(gameId);
            //Qua conviene tenerli così...
            let currentIndex = game.currentTurnIndex || 0;
            const sortedPlayers = game.players; 
            //Anche qui lo stesso

            if (currentIndex >= sortedPlayers.length) {
                TimerService.clearTimer(roomId);
                await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.DISCUSSION, 5, async () => {
                    await this.startVotingPhase(io, roomId, gameId);
                });
                return;
            }

            const currentPlayer = sortedPlayers[currentIndex];
            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.GAME, 5, async () => {
                await this.advanceTurnLogic(io, roomId, gameId, currentPlayer.username); 
            }, { currentTurnIndex: currentIndex });

        } catch (err) {
            console.error("Errore startNextTurn:", err);
        }
    }

    static async handleConfirmWord(io, socket) {
        const { roomId, username } = socket.data;
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;
            
            let game = await GameService.getGameSnapshot(gameId);
            const currentIndex = game.currentTurnIndex || 0;
            
            if (game.players[currentIndex].username !== username) {
                console.warn(`[Cheat] ${username} fuori turno!`);
                return; 
            }

            TimerService.clearTimer(roomId);
            await this.advanceTurnLogic(io, roomId, gameId, username);

        } catch (err) {
            console.error(`[Errore] handleConfirmWord:`, err);
        }
    }

    static async advanceTurnLogic(io, roomId, gameId, username) {
        await GameService.updatePlayerState(gameId, username, { hasSpoken: true });
        
        const game = await GameService.getGameSnapshot(gameId);
        const nextIndex = (game.currentTurnIndex || 0) + 1;
        await GameService.updateMetaField(gameId, 'currentTurnIndex', nextIndex);

        NotificationService.broadcastToRoom(io, roomId, 'playerSpoken', { username, nextIndex });
        await this.startNextTurn(io, roomId, gameId);
    }

    static async startVotingPhase(io, roomId, gameId) {
        await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.VOTING, 60, async () => {
            await this.forceVoteCompletion(io, roomId, gameId);
        });
    }

    static async handleVoteReceived(io, socket, payload) {
        const { roomId, username } = socket.data;
        const { voteFor } = payload;
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;

            const success = await GameService.registerVote(gameId, username, voteFor);
            if (!success) return; 

            NotificationService.broadcastToRoom(io, roomId, 'playerVoted', { username, hasVoted: true });
            
            // Controllo "alive" veloce? Per ora usiamo snapshot per sicurezza sui morti
            const game = await GameService.getGameSnapshot(gameId);
            if (GameService.checkAllAlivePlayersVoted(game.players)) {
                TimerService.clearTimer(roomId);
                await this.proceedToResults(io, roomId, gameId);
            }
        } catch (err) {
            console.error("Errore handleVoteReceived:", err);
        }
    }

    static async forceVoteCompletion(io, roomId, gameId) {
        try {
            let game = await GameService.getGameSnapshot(gameId);
            const idlePlayers = game.players.filter(p => p.isAlive && !p.hasVoted);
            const forcePromises = idlePlayers.map(p => GameService.registerVote(gameId, p.username, null));
            await Promise.all(forcePromises);
            await this.proceedToResults(io, roomId, gameId);
        } catch (err) {
            console.error("Errore forceVoteCompletion:", err);
        }
    }

    static async proceedToResults(io, roomId, gameId) {
        try {
            const resultData = await GameService.processVotingResults(gameId);
            const winStatus = await GameService.checkWinCondition(gameId);
            
            const resultsPayload = {
                lastRoundResult: resultData,
                gameOver: winStatus.isGameOver,
                winner: winStatus.winner,
                cause: winStatus.cause
            }

            await TimerService.startTimedPhase(io, roomId, gameId, 'RESULTS', 5, async () => {
                if (winStatus.isGameOver) {
                    await GameService.updateMetaField(gameId, 'phase', 'FINISH');
                    NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', {
                        phase: 'FINISH',
                        winner: winStatus.winner,
                        cause: winStatus.cause,
                        players: (await GameService.getGameSnapshot(gameId)).players 
                    });
                } else {
                    await GameService.startNewRound(gameId);
                    await this.startTurnAssignmentPhase(io, roomId, gameId);
                }
            }, resultsPayload);

        } catch (err) {
            console.error("Errore proceedToResults:", err);
        }
    }
}

module.exports = GameController;