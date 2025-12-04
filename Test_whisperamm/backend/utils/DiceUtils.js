// src/utils/DiceUtils.js

class DiceUtils {
    /**
     * Genera i valori iniziali dei dadi per la lista di giocatori.
     * Assicura che ogni giocatore abbia un totale unico tra 2 e 12.
     */
    static generateInitialDiceValues(playersList) {
        // Genera i valori dei dadi per ogni utente (2-12 unici)
        const availableNumbers = Array.from({ length: 11 }, (_, i) => i + 2);

        const diceValues = playersList.map(player => {
            const randomIndex = Math.floor(Math.random() * availableNumbers.length);
            // .splice rimuove l'elemento dall'array e lo ritorna
            const totalValue = availableNumbers.splice(randomIndex, 1)[0];
            
            // Definiamo un range sicuro per d1
            const minD1 = Math.max(1, totalValue - 6);
            const maxD1 = Math.min(6, totalValue - 1);
            
            // Generiamo d1 casualmente all'interno di questo range sicuro
            const d1 = Math.floor(Math.random() * (maxD1 - minD1 + 1)) + minD1;
            // Calcoliamo d2 per differenza
            const d2 = totalValue - d1;

            return {
                username: player,
                value1: d1,
                value2: d2,
                total: d1 + d2
            };
        });

        // Ordina e assegna 'order'
        diceValues.sort((a, b) => b.total - a.total);
        diceValues.forEach((data, index) => {
            data.order = index + 1; 
        });

        return diceValues;
    }

    /**
     * Logica di ordinamento round successivi o iniziale
     */
    static sortPlayersForTurn(playersArray, round) {
        if (round === 1) {
            const sorted = [...playersArray].sort((a, b) => {
                return (b.dice1 + b.dice2) - (a.dice1 + a.dice2);
            });
            sorted.forEach((player, index) => player.order = index + 1);
            return sorted;
        } else {
            // Round robin
            const sorted = [...playersArray].sort((a, b) => a.order - b.order);
            const firstPlayer = sorted.shift();
            sorted.push(firstPlayer);
            return sorted;
        }
    }
}

module.exports = DiceUtils;