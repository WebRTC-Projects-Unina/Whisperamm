// src/controllers/GameController.js
const RoomService = require('../services/roomService');
const GameService = require('../services/gameService');
const TimerService = require('../services/timerService');
const NotificationService = require('../services/notificationService');
const PayloadUtils = require('../utils/gamePayloadUtils');
const { GamePhase } = require('../models/Game');

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
            
            // Invio Dati
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

    static async handleRollDice(io, socket) {
        const { username, roomId } = socket.data;
        try {
            // MODIFICA: Usa getGameIdByRoom del Service
            const gameId = await GameService.getGameIdByRoom(roomId); 
            if (!gameId) return;

            // Recupera solo il player necessario se possibile, ma per ora teniamo snapshot
            // (Nota: in futuro puoi ottimizzare facendo PlayerData.get)
            let game = await GameService.getGameSnapshot(gameId);
            const myData = game.players.find(p => p.username === username);

            if (myData.hasRolled) return;

            // Aggiorna player
            await GameService.updatePlayerState(gameId, username, { hasRolled: true });
            
            // Broadcast evento animazione
            NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
                username: username,
                dice1: myData.dice1,
                dice2: myData.dice2,
                color: myData.color
            });
            
            // Ricontrolla stato globale
            game = await GameService.getGameSnapshot(gameId);
            if (GameService.checkAllPlayersRolled(game.players)) {
                TimerService.clearTimer(roomId);
                setTimeout(async () => {
                    await this.startTurnAssignmentPhase(io, roomId, gameId);
                }, 4000);
            }

        } catch (err) {
            console.error(`[Errore] handleRollDice:`, err);
        }
    }

    static async forceRollsAndProceed(io, roomId, gameId) {
        try {
            let game = await GameService.getGameSnapshot(gameId);
            const idlePlayers = game.players.filter(p => !p.hasRolled);
            
            const promises = idlePlayers.map(async (player) => {
                const updatedPlayer = await GameService.updatePlayerState(gameId, player.username, { hasRolled: true });
                NotificationService.broadcastToRoom(io, roomId, 'playerRolledDice', {
                    username: player.username,
                    dice1: updatedPlayer.dice1,
                    dice2: updatedPlayer.dice2,
                    color: updatedPlayer.color
                });
            });

            await Promise.all(promises);
            setTimeout(async () => {
                await this.startTurnAssignmentPhase(io, roomId, gameId);
            }, 4000);
        } catch (err) {
            console.error("Errore in forceRollsAndProceed:", err);
        }
    }

    static async startTurnAssignmentPhase(io, roomId, gameId) {
        try {
            console.log(`[Game] Cambio fase TURN_ASSIGNMENT per ${roomId}`);
            let game = await GameService.getGameSnapshot(gameId);
            
            // Calcola NUOVO ordine (logica)
            const sortedPlayers = GameService.sortPlayersByDice(game.players, game.currentRound);
            
            // Salva ordine su Redis
            const updatePromises = sortedPlayers.map((p, index) => 
                GameService.updatePlayerState(gameId, p.username, { order: index + 1 })
            );
            await Promise.all(updatePromises);

            // IMPORTANTE: Ora sortedPlayers è già ordinato, ma se ri-fetchassimo con getGameSnapshot
            // otterremmo comunque l'array ordinato grazie alla modifica nel Service.
            
            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.TURN_ASSIGNMENT, 5, async () => {
                console.log(`[Timer] Fine visione classifica in ${roomId}.`);
                // Qui chiamiamo direttamente la logica successiva
                await this.handleOrderPhaseComplete(io, roomId);
            }, { players: sortedPlayers });

        } catch (err) {
            console.error("Errore TURN_ASSIGNMENT:", err);
        }
    }

    static async handleOrderPhaseComplete(io, roomId) {
        try {
            const gameId = await GameService.getGameIdByRoom(roomId);
            if (!gameId) return;

            await GameService.updateMetaField(gameId, 'phase', GamePhase.GAME);
            await GameService.updateMetaField(gameId, 'currentTurnIndex', 0);

            await this.startNextTurn(io, roomId, gameId);
        } catch (err) {
            console.error(`[Errore] handleOrderPhaseComplete:`, err);
        }
    }

    static async startNextTurn(io, roomId, gameId) {
        try {
            let game = await GameService.getGameSnapshot(gameId);
            let currentIndex = game.currentTurnIndex || 0;
            
            // MODIFICA: Niente .sort() manuale! getGameSnapshot restituisce players già ordinati.
            // L'ordinamento è garantito dal service.
            const sortedPlayers = game.players; 

            // CASO A: FASE FINITA
            if (currentIndex >= sortedPlayers.length) {
                TimerService.clearTimer(roomId);
                await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.DISCUSSION, 5, async () => {
                    await this.startVotingPhase(io, roomId, gameId);
                });
                return;
            }

            // CASO B: TOCCA AL GIOCATORE
            const currentPlayer = sortedPlayers[currentIndex];
            await TimerService.startTimedPhase(io, roomId, gameId, GamePhase.GAME, 5, async () => {
                console.log(`[Timer] Timeout parola per ${currentPlayer.username}.`);
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
            // Anche qui, players è già ordinato
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