// src/socket/gameSocket.js
const GameController = require('../controllers/GameController');

function attach(socket, io) {
    
    // START
    socket.on('startGame', (payload) => {
        GameController.handleStartGame(io, socket, payload);
    });

    // DADI
    socket.on('DiceRoll', () => {
        GameController.handleRollDice(io, socket);
    });

    // PAROLA
    socket.on('ConfirmWord', () => {
        GameController.handleConfirmWord(io, socket);
    });

    // VOTO
    socket.on('Vote', (payload) => {
        GameController.handleVoteReceived(io, socket, payload);
    });
}

module.exports = { attach };