
const GamePayloadUtils = {

    // --- PER IL BROADCAST (Stato Pubblico) ---
    buildPublicGameData: (game) => {

        return {
            phase: game.phase, // Es: 'lancio_dadi', 'inizio_gioco'
            maxRound: game.maxRound,
            currentRound: game.currentRound,
            players: game.players.map(p => ({
                username: p.username,
                canTalk: p.canTalk,
                isAlive: p.isAlive,   // Utile per mostrare chi è morto     
                color: p.color // Aggiunta del colore per il frontend
            })),
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
            isImpostor: player.role === 'IMPOSTOR', // Flag comodo per il frontend
        };
    }
};

module.exports = GamePayloadUtils;