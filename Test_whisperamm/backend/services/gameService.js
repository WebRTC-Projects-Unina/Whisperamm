// src/services/GameService.js
const crypto = require('crypto');
const { Game, GamePhase } = require('../models/Game');
const { GameSecretsUtil } = require('../utils/GameSecretsUtil'); 

class GameService {

    static async createGame(roomId, playersList) {

        //Da modificare perchè mo mi serviva per testare a volo
        if (!playersList || playersList.length < 2) {
            throw new Error("Servono almeno 2 giocatori");
        }

        const gameId = crypto.randomUUID();
        
        // 1. Genera le parole per Civili e Impostori, in più l'impostore
        const gameSecrets = GameSecretsUtil.getRandomSecrets(); //arriva già seriealizzato
        const imposterIndex = Math.floor(Math.random() * playersList.length);
        const imposterUsername = playersList[imposterIndex];

        // 2. Costruisci mappa giocatori (che verrà serializzato)
        const playersMap = this._buildInitialPlayersMap(playersList, imposterUsername);

        // 3. Prepara Metadati (Serializzazione qui!)
        const metaData = {
            gameId,
            roomId,
            phase: GamePhase.DICE, 
            round: 1,
            secrets: gameSecrets //Stringa JSON arriva dall'utilities
        };

        // 4. Chiama il Model (CRUD pura)
        await Game.create(gameId, metaData, playersMap);

        console.log(`[GameService] Partita ${gameId} creata.`);
        // 5. RILEGGI TUTTO E RITORNA L'OGGETTO COMPLETO
        // Qui avviene la magia: riutilizzi la logica di lettura che parsa i JSON.
        // Così il frontend riceve un oggetto pulito, non stringhe.
        const fullGame = await this.getGameSnapshot(gameId);
        return fullGame;
    }

    static _buildInitialPlayersMap(playersList, imposterUsername) {
        const map = {};
        playersList.forEach(username => {
            const isImpostor = (username === imposterUsername);
            const playerData = {
                username: username,
                role: isImpostor ? 'IMPOSTOR' : 'CIVILIAN',
                isAlive: true,
                canTalk: false,
                votesReceived: 0,
                diceValue: 0,
                order: null 
            };
            // Il Service converte in stringa per Redis
            map[username] = JSON.stringify(playerData); 
            
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

        // Parsing dei giocatori (Da Map di stringhe a Array di oggetti)
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

        // 3. Ritorna l'oggetto pulito e strutturato al Controller/Socket
        return { ...meta, players };
    }

    // --- LOGICA DI AGGIORNAMENTO ---

    /**
     * Esempio di logica di aggiornamento spostata nel Service.
     * Legge lo stato attuale, fa il merge, e risalva la stringa.
     */
    static async updatePlayerState(gameId, username, partialData) {
        // 1. Recupera stringa grezza
        const rawJson = await Game.getPlayerRaw(gameId, username);
        if (!rawJson) throw new Error("Giocatore non trovato");

        // 2. Parse
        let playerData = JSON.parse(rawJson);

        // 3. Modifica (Business Logic)
        playerData = { ...playerData, ...partialData };

        // 4. Stringify e Salvataggio
        await Game.savePlayerRaw(gameId, username, JSON.stringify(playerData));

        return playerData;
    }
}

module.exports = GameService;