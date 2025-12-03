// src/services/GameService.js
const crypto = require('crypto');
const { Game, GamePhase } = require('../models/Game');
const { GameSecretsUtil } = require('../utils/GameSecretsUtil'); 
const RoomService = require('./roomService');
const { PlayerData } = require('../models/playerData');

class GameService {

    static async createGame(roomId) {       
        const gameId = crypto.randomUUID();
        await RoomService.setAllPlayersInGame(roomId) //Novità peppiniana
        
        const playersList = await RoomService.getPlayers(roomId); 


        // Genera le parole per Civili e Impostori, in più l'impostore
        const gameSecrets = GameSecretsUtil.getRandomSecrets(); //arriva già seriealizzato
        const imposterIndex = Math.floor(Math.random() * playersList.length);
        const imposterUsername = playersList[imposterIndex];

        // Genero colori casuali per i giocatori (da aggiornare se vogliamo farli scegliere)
        const colors = {};
        playersList.forEach(username => {
            colors[username] = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        });


        // Genera i valori dei dadi per ogni utente (2-12 unici)
        const availableNumbers = Array.from({ length: 11 }, (_, i) => i + 2);

        // Per ogni player prendo un indice casuale dall'array dei numeri disponibili
        // e lo assegno come valore totale dei dadi (d1 + d2)
        const diceValues = playersList.map(player => {
            const randomIndex = Math.floor(Math.random() * availableNumbers.length);
            // .spice rimuove l'elemento dall'array e lo ritorna come array
            const totalValue = availableNumbers.splice(randomIndex, 1)[0];
            
            // Definiamo un range sicuro per d1
            const minD1 = Math.max(1, totalValue - 6);
            const maxD1 = Math.min(6, totalValue - 1);
            // Generiamo d1 casualmente all'interno di questo range sicuro
            const d1 = Math.floor(Math.random() * (maxD1 - minD1 + 1)) + minD1;
            // Calcoliamo d2 per differenza
            const d2 = totalValue - d1;

            // Ritorniamo l'oggetto per questo giocatore
            return {
                username: player,
                value1: d1,
                value2: d2
            };
        });

        // Ordiniamo i valori dei dadi in ordine decrescente
        // e assegniamo l'ordine di turno a ciascun giocatore
        diceValues.sort((a, b) => (b.value1 + b.value2) - (a.value1 + a.value2));
        diceValues.forEach((data, index) => {
        data.order = index + 1; 
        });

        // Costruisci mappa giocatori (che verrà serializzato)
        const playersMap = this._buildInitialPlayersMap(playersList, imposterUsername, diceValues, colors);

        // 3. Prepara Metadati (Serializzazione qui!)
        const metaData = {
            gameId,
            roomId,
            phase: GamePhase.DICE, 
            round: 1,
            secrets: gameSecrets, //Stringa JSON arriva dall'utilities
            // GG: devo aggiungere un altro campo per gestire il timer in maniera centralizzata
            phaseEndTime: 0
        };

        // 4. Chiama il Model (CRUD pura)
        await Game.create(gameId, metaData, playersMap);

        // 5. RILEGGI TUTTO E RITORNA L'OGGETTO COMPLETO
        // Qui avviene la magia: riutilizzi la logica di lettura che parsa i JSON.
        // Così il frontend riceve un oggetto pulito, non stringhe.
        const fullGame = await this.getGameSnapshot(gameId);
        return fullGame;
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
                userDiceData.order
            );

            // Serializziamo per Redis
            map[username] = JSON.stringify(playerObj); 
        });

        return map;
    }

    // --- LOGICA DI LETTURA ---

    static async getGameSnapshot(gameId) {
        // 1. Chiede i dati grezzi al Model
        const rawData = await Game.findByIdRaw(gameId);
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
        if (players.length > 0 && players[0].order) {
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

    static sortPlayersByDice(playersArray, round) {
        if (round === 1) {
            // Clona l'array per non modificare l'originale
            const sorted = [...playersArray].sort((a, b) => {
                return (b.dice1 + b.dice2) - (a.dice1 + a.dice2);
            });

            // Assegna l'ordine (1, 2, 3, ...) basato sulla posizione ordinata
            sorted.forEach((player, index) => {
                player.order = index + 1;
            });
            return sorted;
        } else {
            //round robin sull'ordine esistente
            const sorted = [...playersArray].sort((a, b) => a.order - b.order);
            const firstPlayer = sorted.shift();
            sorted.push(firstPlayer);
            return sorted;
        }
    }
    
    static checkAllPlayersSpoken(playersArray) {
        // Controlla che ogni giocatore abbia hasSpoken === true
        return playersArray.every(p => p.hasSpoken === true);
    }

}

module.exports = GameService;