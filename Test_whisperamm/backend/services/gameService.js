// src/services/GameService.js
const crypto = require('crypto');
const { Game, GamePhase } = require('../models/Game');
const { PlayerData } = require('../models/playerData');
const { GameSecretsUtil } = require('../utils/GameSecretsUtil'); 
const RoomService = require('./roomService');

// Moduli estratti
const DiceUtils = require('../utils/DiceUtils');
const VotingService = require('./VotingService');

class GameService {

    // --- CREAZIONE E GESTIONE FLUSSO ---

    static async createGame(roomId) {       
        const gameId = crypto.randomUUID();
        await RoomService.setAllPlayersInGame(roomId);
        
        const playersList = await RoomService.getPlayers(roomId); 

        // 1. Setup Ruoli e Segreti
        const gameSecrets = GameSecretsUtil.getRandomSecrets();
        const imposterIndex = Math.floor(Math.random() * playersList.length);
        const imposterUsername = playersList[imposterIndex];

        // 2. Setup Colori
        const colors = this._generateRandomColors(playersList); //Mappa

        // 3. Setup Dadi (Logica delegata a DiceUtils)
        const diceValues = DiceUtils.generateInitialDiceValues(playersList); //mappa

        // 4. Costruisci mappa finale giocatori per Redis
        const playersMap = this._buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors);

        // 5. Prepara Metadati
        const metaData = {
            gameId,
            roomId,
            phase: GamePhase.DICE, 
            round: 1,
            secrets: gameSecrets,  //JSON
            phaseEndTime: 0
        };

        // 6. Salva e Ritorna
        await Game.create(gameId, metaData, playersMap);
        return await this.getGameSnapshot(gameId);
    }

    static async startNewRound(gameId) {
        const game = await this.getGameSnapshot(gameId);
        const nextRound = (game.round || 1) + 1;
        
        await this.updateMetaField(gameId, 'round', nextRound);

        // Reset massivo degli stati temporanei
        const resetPromises = game.players.map(p => 
            this.updatePlayerState(gameId, p.username, {
                hasRolled: false,
                dice1: 0,
                dice2: 0,
                hasSpoken: false,
                hasVoted: false,
                votesReceived: 0
            })
        );

        await Promise.all(resetPromises);
        console.log(`[Game] Round ${nextRound} iniziato.`);
        return await this.getGameSnapshot(gameId);
    }

    static async advancePhase(gameId, newPhase) {
        await Game.updateMetaField(gameId, 'phase', newPhase);
        return await this.getGameSnapshot(gameId);
    }

    // --- LOGICA DI VOTO ---

    static async registerVote(gameId, voterUsername, targetUsername) {
        const game = await this.getGameSnapshot(gameId);
        const voter = game.players.find(p => p.username === voterUsername);
        
        if (voter && !voter.hasVoted) {
            await this.updatePlayerState(gameId, voterUsername, { hasVoted: true });
            
            if (targetUsername) {
                const target = game.players.find(p => p.username === targetUsername);
                if (target) {
                    const currentVotes = (target.votesReceived || 0) + 1;
                    await this.updatePlayerState(gameId, targetUsername, { votesReceived: currentVotes });
                }
            }
            return true;
        }
        return false;
    }

    static async processVotingResults(gameId) {
        const game = await this.getGameSnapshot(gameId);
        
        // Delega il calcolo matematico al VotingService
        const result = VotingService.calculateElimination(game);

        if (result.eliminatedUser) {
            // Applica l'effetto (Side Effect) nel DB
            await this.updatePlayerState(gameId, result.eliminatedUser.username, { isAlive: false });
            
            return { 
                eliminated: result.eliminatedUser.username, 
                role: result.eliminatedUser.role, 
                votes: result.eliminatedUser.votesReceived,
                message: result.message 
            };
        }

        return { eliminated: null, message: result.message };
    }

    // --- CHECKERS & HELPERS ---

    static async checkWinCondition(gameId) {
        const game = await this.getGameSnapshot(gameId);
        const aliveImpostors = game.players.filter(p => p.isAlive && p.role === 'IMPOSTOR').length;
        const aliveCivilians = game.players.filter(p => p.isAlive && p.role === 'CIVILIAN').length;

        if (aliveImpostors === 0) return { isGameOver: true, winner: 'CIVILIANS' };
        if (aliveImpostors >= aliveCivilians) return { isGameOver: true, winner: 'IMPOSTORS' };

        return { isGameOver: false, winner: null };
    }

    static checkAllPlayersRolled(playersArray) {
        return playersArray.every(p => p.hasRolled === true);
    }

    static checkAllPlayersSpoken(playersArray) {
        return playersArray.every(p => p.hasSpoken === true);
    }

    static checkAllAlivePlayersVoted(players) {
        return VotingService.checkAllAlivePlayersVoted(players);
    }
    
    // Wrapper per l'ordinamento (proxy verso Utils)
    static sortPlayersByDice(playersArray, round) {
        return DiceUtils.sortPlayersForTurn(playersArray, round);
    }

    // --- METODI DATA LAYER / CRUD ---

    static async getGameSnapshot(gameId) {
        const game = await Game.getGame(gameId);
        if (!game) return null;

        const { meta, playersHash } = game;

        // Deserializzazione sicura
        meta.secrets = this._safeJsonParse(meta.secrets);
        meta.phaseEndTime = meta.phaseEndTime ? parseInt(meta.phaseEndTime, 10) : 0;
        meta.currentTurnIndex = meta.currentTurnIndex ? parseInt(meta.currentTurnIndex, 10) : undefined;

        const players = []; 
        if (playersHash) {
            Object.values(playersHash).forEach(jsonStr => {
                const p = this._safeJsonParse(jsonStr);
                if (p) players.push(p);
            });
        } 
        
        if (players.length > 0 && players[0].order) {
            players.sort((a, b) => a.order - b.order);
        }   
        
        return { ...meta, players }; //Spread Notation per ..., scompattamm meta.
    }

    static async getGameSnapshotByRoomId(roomId) {
        const gameId = await Game.findGameIdByRoomId(roomId);
        return gameId ? this.getGameSnapshot(gameId) : null;
    }

    static async updateMetaField(gameId, field, value) {
        await Game.updateMetaField(gameId, field, value);
    }

    static async updatePlayerState(gameId, username, partialData) {
        return await PlayerData.update(gameId, username, partialData);
    }

    // --- PRIVATE UTILS ---
    static _buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors) {
        const map = {};
        playersList.forEach(username => {
            const isImpostor = (username === imposterUsername);
            const userDiceData = diceValues.find(d => d.username === username);
            const role = isImpostor ? 'IMPOSTOR' : 'CIVILIAN';

            // Creiamo l'oggetto base. Niente "secretWord" qui dentro.
            const playerObj = PlayerData.createPlayerData(
                username, 
                role, 
                userDiceData.value1, 
                userDiceData.value2, 
                colors[username], 
                userDiceData.order
            );

            map[username] = JSON.stringify(playerObj); 
        });
        return map;
    }

    static _generateRandomColors(playersList) {
        const colors = {};
        playersList.forEach(username => {
            colors[username] = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        });
        return colors;
    }

    static _safeJsonParse(str) {
        try { return JSON.parse(str); } catch (e) { return null; }
    }
}

module.exports = GameService;