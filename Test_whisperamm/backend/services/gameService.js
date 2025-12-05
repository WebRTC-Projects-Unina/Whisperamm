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
        //A questo punto mi sa che potremmo anche mettere la creazione dei metadati di game qui
        //Mentre la parte che riguarda playerdata in playerDataModel
        return await this.getGameSnapshot(gameId);
    }

    static async updateMetaField(gameId, field, value) {
        // Chiama il model
        await Game.updateMetaField(gameId, field, value);
    }

    static _buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors = null) {
        const map = {};
        
        playersList.forEach(username => {
            const isImpostor = (username === imposterUsername);
            const userDiceData = diceValues.find(d => d.username === username);
            const userColor = colors ? colors[username] : null;
            const role = isImpostor ? 'IMPOSTOR' : 'CIVILIAN';

            // Usiamo 
            // Non costruiamo l'oggetto a mano qui.
            const playerObj = PlayerData.createPlayerData(
                username, 
                role, 
                userDiceData.value1, 
                userDiceData.value2, 
                userColor, // color 
            );

            // Serializziamo per Redis
            map[username] = JSON.stringify(playerObj); 
        });

        return map;
    }

    // --- LOGICA DI LETTURA ---

    static async getGameSnapshot(gameId) {
        // 1. Chiede i dati grezzi al Model
        const rawData = await Game.findByIdRaw(gameId); //Qua dobbiamo cambiare assoltamente nome al metodo get
        if (!rawData) return null;

        const { meta, playersHash } = rawData;

        // 2. DESERIALIZZAZIONE (Logica spostata qui)
        
        // Parsing dei segreti
        if (meta.secrets) {
            try {
                meta.secrets = JSON.parse(meta.secrets);
            } catch (e) {
                console.error("Errore parsing secrets service:", e);
                meta.secrets = null; 
            }
        }
        if(meta.currentRound) {
            meta.currentRound = parseInt(meta.currentRound, 10);
        }
        // Parsing del tempo (da stringa a numero)
        if (meta.phaseEndTime) {
            meta.phaseEndTime = parseInt(meta.phaseEndTime, 10);
        }   

        if (meta.currentTurnIndex !== undefined) {
            meta.currentTurnIndex = parseInt(meta.currentTurnIndex, 10);
        }

        // Manteniamo l'oggetto/mappa
        const players = []; 

        if (playersHash) {
            Object.values(playersHash).forEach(jsonStr => {
                try {
                    players.push(JSON.parse(jsonStr));
                } catch (e) {
                    console.error("Errore parsing player service:", e);
                }
            });
        
        } 
        if (players.length > 0 && players[0].order) { //Non so se serve ancora.
            players.sort((a, b) => a.order - b.order);
        }   
        // 3. Ritorna l'oggetto pulito e strutturato al Controller/Socket
        return { ...meta, players };
    }

    static async getGameSnapshotByRoomId(roomId) {
        const gameId = await Game.findGameIdByRoomId(roomId);
        if (!gameId) return null;
        return this.getGameSnapshot(gameId);
    }

    // --- LOGICA DI AGGIORNAMENTO ---
    static async updatePlayerState(gameId, username, partialData) {
        return await PlayerData.update(gameId, username, partialData);
    }

    
    static checkAllPlayersRolled(playersArray) {
        // Controlla che ogni giocatore abbia hasRolled === true
        return playersArray.every(p => p.hasRolled === true);
    }

    /**
     * NUOVO: Cambia la fase del gioco (es. da DICE a GAME)
     */
    static async advancePhase(gameId, newPhase) {
        await Game.updateMetaField(gameId, 'phase', newPhase);
        // Ritorniamo lo snapshot aggiornato
        return await this.getGameSnapshot(gameId);
    }

    // GG: Funzione per aggiornamento del parametro order
    // currentRound === 1 -> ordine scandito dai dadi
    // currentRound > 1 -> ordine stabilito applicando il Round Robin sui giocatori vivi
    static sortPlayersByDice(playersArray, round) {
        // Separiamo i vivi dai morti
        const alivePlayers = playersArray.filter(p => p.isAlive !== false); // !== false gestisce anche undefined all'inizio
        const deadPlayers = playersArray.filter(p => p.isAlive === false);

        if (round === 1) {
            // Ordina i vivi per somma dadi DECRESCENTE
            alivePlayers.sort((a, b) => {
                const sumA = (a.dice1 || 0) + (a.dice2 || 0);
                const sumB = (b.dice1 || 0) + (b.dice2 || 0);
                return sumB - sumA; 
            });
        } else { // round > 1
            // Ordiniamo i vivi in base al loro ordine precedente
            alivePlayers.sort((a, b) => (a.order || 0) - (b.order || 0));

            // Rotazione: Il primo della lista passa in fondo
            if (alivePlayers.length > 0) {
                const firstPlayer = alivePlayers.shift();
                alivePlayers.push(firstPlayer);
            }
        }
        alivePlayers.forEach((player, index) => {
            player.order = index + 1;
        });

        // Ai morti assegniamo ordine 0 (o un numero alto tipo 99) per spingerli in fondo
        deadPlayers.forEach(player => {
            player.order = 0; 
        });

        // 4. Ritorniamo l'array completo aggiornato
        return [...alivePlayers, ...deadPlayers];
    }
    
    static checkAllPlayersSpoken(playersArray) {
        // Controlla che ogni giocatore abbia hasSpoken === true
        return playersArray.every(p => p.hasSpoken === true);
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

    /**
     * Prepara il gioco per il round successivo.
     * Resetta: dadi, voti, stati (hasRolled, hasSpoken, hasVoted).
     * Incrementa: round.
     */
    static async startNewRound(gameId) {
        const game = await this.getGameSnapshot(gameId);
        
        // Incrementa il numero del currentRound
        const nextRound = (game.currentRound || 1) + 1;
        await this.updateMetaField(gameId, 'currentRound', nextRound);

        // Resetta i dati di TUTTI i giocatori (vivi e morti, per pulizia)
        const resetPromises = game.players.map(p => {
            // Manteniamo solo i dati persistenti (ruolo, vita, colore, username)
            // Resettiamo quelli di fase
            return this.updatePlayerState(gameId, p.username, {
                hasRolled: false,
                hasSpoken: false,
                hasVoted: false,
                votesReceived: 0
            });
        });
        await Promise.all(resetPromises);
        
        console.log(`[Game] Round ${nextRound} preparato. Dati resettati.`);
        
        return await this.getGameSnapshot(gameId);
    }

    /**
     * Controlla le condizioni di vittoria.
     * Ritorna: { isGameOver: boolean, winner: 'CIVILIANS' | 'IMPOSTORS' | null }
     */
    static async checkWinCondition(gameId) {
        const game = await this.getGameSnapshot(gameId);
        const aliveImpostors = game.players.filter(p => p.isAlive && p.role === 'IMPOSTOR').length;
        const aliveCivilians = game.players.filter(p => p.isAlive && p.role === 'CIVILIAN').length;

        console.log(`[GameCheck] Impostori: ${aliveImpostors}, Civili: ${aliveCivilians}`);

        if (aliveImpostors === 0) {
            return { isGameOver: true, winner: 'CIVILIANS', cause: 'guessedImpostors'};
        }
        
        if (aliveImpostors >= aliveCivilians) {
            return { isGameOver: true, winner: 'IMPOSTORS', cause: 'killAllCivilians'};
        }

        if (game.currentRound >= game.maxRound) {
            return { isGameOver: true, winner: 'IMPOSTORS', cause: 'roundsExceeded'}
        }
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
        //Da capire se è utile oppure no creare i json, perchè magari serializzare e deserializzare potrebbe essere impattante
        try { return JSON.parse(str); } catch (e) { return null; }
    }
}

module.exports = GameService;