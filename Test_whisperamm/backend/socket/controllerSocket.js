const lobbySocket = require('./lobbySockets');
const gameSocket = require('./gameSockets');

//Central socket controller

module.exports = function registerSocketController(io) {
    io.on('connection', (socket) => {
        // Possiamo aggiungere un middleware per ogni socket.

        // Attacca gli handler dei moduli
        if (lobbySocket && typeof lobbySocket.attach === 'function') {
            lobbySocket.attach(socket, io);
        }

        if (gameSocket && typeof gameSocket.attach === 'function') {
            gameSocket.attach(socket, io);
        }
    });
};
