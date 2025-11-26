// src/utils/GameSecretsUtil.js

const wordPairs = [
    { category: 'Cibo', wordA: 'Pizza', wordB: 'Pasta' },
    { category: 'Trasporti', wordA: 'Treno', wordB: 'Metro' },
    { category: 'Animali', wordA: 'Cane', wordB: 'Lupo' },
];

class GameSecretsUtil {

    
    static getRandomSecrets() {
        const randomIndex = Math.floor(Math.random() * wordPairs.length);
        const pair = wordPairs[randomIndex];

        // Randomizza chi prende quale parola
        const swap = Math.random() > 0.5;

        const secrets ={
            category: pair.category,
            civilianWord: swap ? pair.wordA : pair.wordB, // Uso i nomi del diagramma
            impostorWord: swap ? pair.wordB : pair.wordA
        }
        return JSON.stringify(secrets);
    }
}

module.exports = { GameSecretsUtil };