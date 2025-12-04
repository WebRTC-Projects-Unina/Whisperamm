// src/services/VotingService.js

class VotingService {
    
    /**
     * Calcola chi viene eliminato basandosi sullo snapshot attuale
     */
    static calculateElimination(gameSnapshot) {
        const alivePlayers = gameSnapshot.players.filter(p => p.isAlive);

        // Ordina per voti ricevuti (decrescente)
        alivePlayers.sort((a, b) => (b.votesReceived || 0) - (a.votesReceived || 0));

        const first = alivePlayers[0];
        const second = alivePlayers[1];

        // Caso A: Nessun voto valido
        if (!first || (first.votesReceived || 0) === 0) {
             return { eliminatedUser: null, message: "Nessuno ha ricevuto abbastanza voti." };
        }

        // Caso B: Pareggio
        if (second && first.votesReceived === second.votesReceived) {
            return { eliminatedUser: null, message: "Pareggio! Nessuno viene eliminato." };
        }

        // Caso C: Eliminazione
        return { 
            eliminatedUser: first, // Ritorna l'oggetto player intero
            message: `${first.username} è stato eliminato.` 
        };
    }

    static checkAllAlivePlayersVoted(players) {
        const alivePlayers = players.filter(p => p.isAlive);
        return alivePlayers.every(p => p.hasVoted);
    }
}

module.exports = VotingService;