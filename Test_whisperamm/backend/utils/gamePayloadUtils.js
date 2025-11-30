
const GamePayloadUtils = {

    // --- PER IL BROADCAST (Stato Pubblico) ---
    buildPublicGameData: (game) => {

        return {
            phase: game.phase, // Es: 'lancio_dadi', 'inizio_gioco'
            round: game.round,
            players: game.players.map(p => ({
                username: p.username,
                canTalk: p.canTalk,
                isAlive: p.isAlive,   // Utile per mostrare chi è morto     
                // --- AGGIUNTE FONDAMENTALI PER I DADI ---
                hasRolled: p.hasRolled, // Per disabilitare il pulsante o mostrare la spunta
                diceValue: p.diceValue, // Per mostrare il numero (visto che è pubblico)
                hasSpoken: p.hasSpoken,
                // --- AGGIUNTA PER L'ORDINE ---
                // Quando la fase cambia in 'GAME', il frontend deve sapere l'ordine
                order: p.order,
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