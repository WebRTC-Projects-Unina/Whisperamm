// src/services/GameService.js
const { Game, GameStatus } = require('../models/Game'); // ✅ Import corretto: Game invece di GameModel

class GameService {

    static async createGame(roomId, playersList) {
        // Qui potresti aggiungere logiche tipo: "Ci sono abbastanza giocatori?"
        if (playersList.length < 2) {
            throw new Error("Servono almeno 2 giocatori");
        }
        // ✅ Usa Game
        return await Game.create(roomId, playersList);
    }

    /**
     * Gestisce il lancio dei dadi per un utente
     */
    static async rollDice(gameId, username) {
        // 1. Recupera stato attuale
        // ✅ Usa Game
        const game = await Game.findById(gameId);
        if (!game) throw new Error("Partita non trovata");

        // 2. Validazioni Logiche
        if (game.status !== GameStatus.DICE_ROLLING) {
            throw new Error("Non è il momento di lanciare i dadi");
        }

        const player = game.players.find(p => p.username === username);
        if (!player) throw new Error("Giocatore non trovato nella partita");

        if (player.dice && player.dice.length > 0) {
            throw new Error("Hai già lanciato i dadi!");
        }

        // 3. Logica di Gioco (Generazione Random)
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const total = die1 + die2;
        const diceResult = [die1, die2];

        // 4. Persistenza
        // ✅ Usa Game
        const updatedPlayer = await Game.updatePlayer(gameId, username, {
            dice: diceResult
        });

        // 5. Controllo "Hanno lanciato tutti?"
        // Rileggiamo o aggiorniamo la lista locale per fare il check
        const allPlayers = game.players.map(p => p.username === username ? updatedPlayer : p);
        
        const everyoneRolled = allPlayers.every(p => p.dice && p.dice.length > 0);
        let nextStateTriggered = false;

        if (everyoneRolled) {
            // Calcola l'ordine (Logica semplice: somma più alta inizia)
            // Ordina decrescente (b - a)
            allPlayers.sort((a, b) => (b.dice[0] + b.dice[1]) - (a.dice[0] + a.dice[1]));

            // Assegna ordine
            for (let i = 0; i < allPlayers.length; i++) {
                // ✅ Usa Game
                await Game.updatePlayer(gameId, allPlayers[i].username, { order: i + 1 });
            }

            // Cambio stato
            // ✅ Usa Game
            await Game.updateMeta(gameId, 'status', GameStatus.ASSIGNMENT); 
            nextStateTriggered = true;
        }

        return {
            dice: diceResult,
            total,
            player: updatedPlayer,
            everyoneRolled,
            nextStateTriggered,
            newStatus: nextStateTriggered ? GameStatus.ASSIGNMENT : GameStatus.DICE_ROLLING
        };
    }
    
    static async getGameSnapshot(gameId) {
        // ✅ Usa Game
        return await Game.findById(gameId);
    }
}

module.exports = GameService;