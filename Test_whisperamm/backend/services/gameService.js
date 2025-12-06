// src/services/GameService.js
const crypto = require('crypto');
const { Game, GamePhase } = require('../models/Game');
const { PlayerData } = require('../models/playerData');
const { GameSecretsUtil } = require('../utils/GameSecretsUtil'); 
const RoomService = require('./roomService');
const DiceUtils = require('../utils/DiceUtils');
const VotingService = require('./VotingService');

class GameService {

    // ==========================================
    // 1. CREAZIONE E AVVIO
    // ==========================================

    static async createGame(roomId) {       
        const gameId = crypto.randomUUID();
        await RoomService.setAllPlayersInGame(roomId);
        
        const playersList = await RoomService.getPlayers(roomId); 

        // 1. Setup Ruoli e Segreti
        const gameSecrets = GameSecretsUtil.getRandomSecrets();
        const imposterIndex = Math.floor(Math.random() * playersList.length);
        const imposterUsername = playersList[imposterIndex];

        // 2. Setup Colori
        const colors = this._generateRandomColors(playersList);

        // 3. Setup Dadi (Logica delegata a DiceUtils)
        const diceValues = DiceUtils.generateInitialDiceValues(playersList);

        // 4. Costruisci mappa finale giocatori per Redis
        const playersMap = this._buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors);

        // 5. Prepara Metadati
        const metaData = {
            gameId,
            roomId,
            phase: GamePhase.DICE, 
            round: 1,
            secrets: gameSecrets, // Redis serializza autom. se supportato, altrimenti stringify
            phaseEndTime: 0
        };

        // 6. Salva e Ritorna
        await Game.create(gameId, metaData, playersMap); 
        
        return await this.getGameSnapshot(gameId);
    }

    // ==========================================
    // 2. LOGICA DI LETTURA (Data Retrieval)
    // ==========================================

    /**
     * Ritorna solo ID gioco (Wrapper al model)
     */
    static async getGameIdByRoom(roomId) {
        return await Game.findGameIdByRoomId(roomId);
    }

    /**
     * Ritorna UN singolo giocatore (Lettura O(1) Redis)
     * Utile per check veloci (es. hasRolled, hasVoted)
     */
    static async getPlayer(gameId, username) {
        return await PlayerData.get(gameId, username);
    }

    /**
     * Ritorna TUTTI i giocatori (lista ordinata) SENZA metadata/secrets.
     * Molto più leggero di getGameSnapshot.
     */
    static async getPlayers(gameId) {
        // Usa il metodo esistente nel model Game.js che ritorna l'hash
        const playersHash = await Game.getPlayers(gameId); 
        
        if (!playersHash) return [];
        
        const players = [];
        Object.values(playersHash).forEach(jsonStr => {
            const p = this._safeJsonParse(jsonStr);
            if (p) players.push(p);
        });

        // Applica ordinamento centralizzato
        if (players.length > 0) {
            players.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        return players;
    }

    /**
     * Ritorna lo STATO COMPLETO del gioco (Metadata + Players + Secrets).
     * Usato all'avvio o per refresh completi.
     */
    static async getGameSnapshot(gameId) {
        // Chiede i dati grezzi al Model
        const rawData = await Game.getGame(gameId);
        if (!rawData) return null;

        const { meta, playersHash } = rawData;

        // Deserializzazione Metadati
        meta.secrets = this._safeJsonParse(meta.secrets);
        if (meta.currentRound) meta.currentRound = parseInt(meta.currentRound, 10);
        if (meta.phaseEndTime) meta.phaseEndTime = parseInt(meta.phaseEndTime, 10);
        if (meta.currentTurnIndex !== undefined) meta.currentTurnIndex = parseInt(meta.currentTurnIndex, 10);

        // Deserializzazione Players
        const players = []; 
        if (playersHash) {
            Object.values(playersHash).forEach(jsonStr => {
                const p = this._safeJsonParse(jsonStr);
                if (p) players.push(p);
            });
        } 
        
        // Sorting
        if (players.length > 0) {
            players.sort((a, b) => (a.order || 0) - (b.order || 0));
        }   
        
        return { ...meta, players };
    }

    static async getGameSnapshotByRoomId(roomId) {
        const gameId = await this.getGameIdByRoom(roomId);
        return gameId ? this.getGameSnapshot(gameId) : null;
    }

    // ==========================================
    // 3. LOGICA DI AGGIORNAMENTO (Updates)
    // ==========================================


    /**
     * Calcola il nuovo ordine dei turni basato sui dadi e sul round,
     * aggiorna il DB e restituisce la lista ordinata.
     */
    static async assignTurnOrder(gameId) {
        // 1. Recupera TUTTO lo stato (Players + Meta) in una sola chiamata
        // Risparmiamo una query rispetto al codice precedente
        const game = await this.getGameSnapshot(gameId);
        
        // 2. Logica di ordinamento (delegata all'Utils)
        // Usa game.players e game.currentRound recuperati dallo snapshot
        const sortedPlayers = DiceUtils.sortPlayersForTurn(game.players, game.currentRound || 1);
        
        // 3. Persistenza: Aggiorna il campo 'order' per ogni giocatore
        // Usiamo this.updatePlayerState che astrae la scrittura sul DB
        const updatePromises = sortedPlayers.map((p, index) => 
            this.updatePlayerState(gameId, p.username, { order: index + 1 })
        );
        await Promise.all(updatePromises);

        // 4. Ritorna i dati pronti per il Controller (e il Frontend)
        return sortedPlayers;
    }


    static async updatePlayerState(gameId, username, partialData) {
        return await PlayerData.update(gameId, username, partialData);
    }

    static async updateMetaField(gameId, field, value) {
        await Game.updateMetaField(gameId, field, value);
    }

    static async advancePhase(gameId, newPhase) {
        await Game.updateMetaField(gameId, 'phase', newPhase);
        return await this.getGameSnapshot(gameId);
    }

    static async startNewRound(gameId) {
        const game = await this.getGameSnapshot(gameId);
        const nextRound = (game.currentRound || 1) + 1;
        
        await this.updateMetaField(gameId, 'currentRound', nextRound);
        
        const resetPromises = game.players.map(p => {
            return this.updatePlayerState(gameId, p.username, { 
                hasRolled: false, 
                hasSpoken: false, 
                hasVoted: false, 
                votesReceived: 0 
            });
        });
        
        await Promise.all(resetPromises);
        return await this.getGameSnapshot(gameId);
    }


    /**
     * Prepara il DB per l'inizio della fase di gioco (parlata).
     * Imposta la fase e resetta l'indice del turno.
     */
    static async prepareGamePhase(gameId) {

        await Promise.all([
            Game.updateMetaField(gameId, 'phase', GamePhase.GAME),
            Game.updateMetaField(gameId, 'currentTurnIndex', 0)
        ]); //Forse questo posso farlo anche in maniera transazionale..
        
        // Ritorna true o void, basta che la promise si risolva
    }

    // ==========================================
    // 4. LOGICA DI GIOCO (Voting, Checking)
    // ==========================================

    /**
     * Controlla lo stato del turno attuale.
     * Restituisce un oggetto che dice al Controller se il giro è finito o chi deve parlare.
     */
    static async getCurrentTurnStatus(gameId) {
        // Recuperiamo lo snapshot (usiamo il metodo esistente che incapsula le chiamate al Model)
        const game = await this.getGameSnapshot(gameId);
        
        const currentIndex = game.currentTurnIndex || 0;
        const totalPlayers = game.players.length;

        // È finito il giro?
        if (currentIndex >= totalPlayers) {
            return { status: 'ROUND_OVER' };
        }

        // LOGICA DI BUSINESS: Chi tocca?
        return { 
            status: 'PLAY_TURN', 
            player: game.players[currentIndex], 
            index: currentIndex 
        };
    }


    static async registerVote(gameId, voterUsername, targetUsername) {
        const voter = await this.getPlayer(gameId, voterUsername);
        
        if (voter && !voter.hasVoted) {
            await this.updatePlayerState(gameId, voterUsername, { hasVoted: true });
            
            if (targetUsername) {
                const target = await this.getPlayer(gameId, targetUsername);
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
        const result = VotingService.calculateElimination(game);
        
        if (result.eliminatedUser) {
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

    static async checkWinCondition(gameId) {
        const players = await this.getPlayers(gameId);
        const aliveImpostors = players.filter(p => p.isAlive && p.role === 'IMPOSTOR').length;
        const aliveCivilians = players.filter(p => p.isAlive && p.role === 'CIVILIAN').length;
        
        // Recupera round dai meta (perché non è nei players)
        const rawData = await Game.getGame(gameId);
        const currentRound = rawData && rawData.meta ? parseInt(rawData.meta.currentRound || 1) : 1;
        
        if (aliveImpostors === 0) return { isGameOver: true, winner: 'CIVILIANS', cause: 'guessedImpostors'};
        if (aliveImpostors >= aliveCivilians) return { isGameOver: true, winner: 'IMPOSTORS', cause: 'killAllCivilians'};
        if (currentRound >= 10) return { isGameOver: true, winner: 'IMPOSTORS', cause: 'roundsExceeded'}
        
        return { isGameOver: false, winner: null };
    }

    // ==========================================
    // 5. UTILS & HELPERS
    // ==========================================

    static checkAllPlayersRolled(playersArray) {
        return playersArray.every(p => p.hasRolled === true);
    }

    static checkAllPlayersSpoken(playersArray) {
        return playersArray.every(p => p.hasSpoken === true);
    }

    static checkAllAlivePlayersVoted(players) {
        return VotingService.checkAllAlivePlayersVoted(players);
    }

    static sortPlayersByDice(playersArray, round) {
        return DiceUtils.sortPlayersForTurn(playersArray, round);
    }

    // --- Private Methods ---

    static _buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors) {
        const map = {};
        playersList.forEach(username => {
            const isImpostor = (username === imposterUsername);
            const userDiceData = diceValues.find(d => d.username === username);
            const playerObj = PlayerData.createPlayerData(
                username, 
                isImpostor ? 'IMPOSTOR' : 'CIVILIAN', 
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