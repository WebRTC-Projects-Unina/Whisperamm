
const GamePayloadUtils = {

    // --- PER IL BROADCAST (Tutti vedono questo) ---
    buildPublicGameData: (game) => {
        return {
            phase: game.phase,
            round: game.round,
            players: game.players.map(p => ({
                username: p.username,
                canTalk: p.canTalk //Inizialmente tutti possono parlare
            }))
        };
    },

    // --- PER LO SPECIFICO (Solo io vedo questo) ---
    buildPrivateIdentity: (player, gameSecrets) => {
        // Logica per determinare la parola
        const secretWord = (player.role === 'IMPOSTOR') 
            ? gameSecrets.impostorWord 
            : gameSecrets.civilianWord;

        return { //Tutte info sensibili insomma.
            role: player.role,       
            secretWord: secretWord, 
            isImpostor: player.role === 'IMPOSTOR' // Flag comodo per il frontend
        };
    },

    buildDiceRollResult: (diceValue) => {
        return {
            diceValue: diceValue
        };
    }
};

module.exports = GamePayloadUtils;