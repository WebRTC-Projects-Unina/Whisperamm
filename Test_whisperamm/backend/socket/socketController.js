const chatSocket = require('./chatSocket');
const gameSocket = require('./gameSocket');

/**
 * Central socket controller
 */
module.exports = function registerSocketController(io) {
    io.on('connection', (socket) => {
        // Possiamo aggiungere un middleware per ogni socket.

        // Attacca gli handler dei moduli
        if (chatSocket && typeof chatSocket.attach === 'function') {
            chatSocket.attach(socket, io);
        }

        if (gameSocket && typeof gameSocket.attach === 'function') {
            gameSocket.attach(socket, io);
        }
    });
};
