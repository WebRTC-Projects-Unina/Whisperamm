const { lobbies } = require('./stateSocket');
const { Game } = require('../services/game');


async function handleDiceRoll(io, socket) {
    
    const username = socket.data.username;
    const gameId = socket.data.gameId;

    // Controlli di sicurezza
    if (!gameId || !username) return;
    console.log(`[Socket] Ricevuta richiesta di lancio dadi da ${username} in gioco ${gameId}`);
    

}

function attach(socket, io) {
    
    socket.on('diceRoll', (payload) => handleDiceRoll(io, socket, payload));
    
}

module.exports = { attach };