const { lobbies } = require('./stateSocket');
const { Game } = require('../services/game');


async function handleDiceRoll(io, socket) {

    console.log(`[Socket] Ricevuta richiesta di lancio dadi da ${username} in gioco ${gameId}`);
    const username = socket.data.username;
    const gameId = socket.data.gameId;

    // Controlli di sicurezza
    if (!gameId || !username) return;

    console.log(`[Socket] Ricevuta richiesta di lancio dadi da ${username} in gioco ${gameId}`);
    


    
    


}

async function handleDiceRoll(io, socket, payload, ack) {
    console.log(`[Socket] Ricevuta richiesta di lancio dadi da ${username} in gioco ${gameId}`);

    const { gameId, username } = socket.data;
    if (!gameId || !username) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Non autenticato' });
        return;
    }

    try {
        const game = await Game.get(gameId);
        if (!game) {
        if (typeof ack === 'function') ack({ ok: false, message: 'Partita non trovata' });
        return;
        }

        // Usa il service per lanciare i dadi per TUTTI
        const result = await GameService.rollDiceForAllPlayers(gameId);

        // Emetti il risultato a tutti
        io.to(gameId).emit('diceRollComplete', {
        updates: result.updates,
        newStatus: result.status
        });

        if (typeof ack === 'function') ack({ ok: true, result });
    } catch (err) {
        console.error('Errore in handleDiceRoll:', err);
        if (typeof ack === 'function') ack({ ok: false, message: err.message });
    }

}
function attach(socket, io) {
    
    socket.on('diceRoll', (payload) => handleDiceRoll(io, socket, payload));
    
}

module.exports = { attach };