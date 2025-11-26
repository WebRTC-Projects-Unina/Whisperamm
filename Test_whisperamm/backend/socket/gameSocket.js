// src/socket/gameSocket.js
const GameService = require('../services/gameService');
const RoomService = require('../services/roomService');
const NotificationService = require('../services/notificationService');
const PayloadUtils = require('../utils/gamePayloadUtils');

async function handleGameStarted(io, socket, { roomId }) {
    const { username } = socket.data;

    const gamePayload = { roomId };
    
    // 1. AVVISO NAVIGAZIONE (Immediato)
    NotificationService.broadcastToRoom(
        io,
        roomId,
        'gameStarted',
        gamePayload
    );

    try {

        //Controllo per vedere se è l'admin a fare start game
        const isHost = await RoomService.isUserHost(roomId, username);
        if (!isHost) {
            socket.emit('lobbyError', { message: 'Solo l\'admin può avviare la partita.' });
            return;
        }

        console.log(`[Socket] Admin ${username} avvia gioco in ${roomId}`);

        // 2. CREAZIONE GIOCO
        const playersList = await RoomService.getPlayers(roomId);
        const game = await GameService.createGame(roomId, playersList);

       
        // --- MODIFICA QUI: RITARDO STRATEGICO ---
        // Aspettiamo 1 secondo che tutti i client abbiano caricato la pagina Game
        console.log("Attendo navigazione client...");
        
        setTimeout(() => {
            console.log("Invio dati di gioco (Delay scaduto)");

            // 3. STEP A: Dati Pubblici (Ora il frontend è pronto a riceverli)
            const publicPayload = PayloadUtils.buildPublicGameData(game);
            
            NotificationService.broadcastToRoom(
                io, 
                roomId, 
                'parametri', 
                publicPayload
            );

            console.log("Mo mannamm i dati privati")
            // 4. STEP B: Dati Privati
            NotificationService.sendPersonalizedToRoom(
                io,
                roomId, 
                game.players, 
                'identityAssigned',
                (player) => {
                    return PayloadUtils.buildPrivateIdentity(player, game.secrets);
                }
            );
        }, 1000); // 1000ms = 1 secondo di attesa

    } catch (err) {
        console.error(`[Errore] handleGameStarted:`, err);
        socket.emit('lobbyError', { 
            message: err.message || 'Errore avvio partita' 
        });
    }
}

function attach(socket, io) {
    socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
}

module.exports = { attach };