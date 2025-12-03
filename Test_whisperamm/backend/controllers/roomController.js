// controllers/roomController.js
const RoomService = require('../services/roomService');

exports.createGame = async (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;
        
        if (!user || !user.username) {
            return res.status(400).json({ message: "Dati Admin mancanti."});
        }

        const roomId = await RoomService.createRoom(
            roomName,
            user.username,
            maxPlayers,
            rounds
        );

        console.log(`[RoomController] Stanza ${roomId} creata con successo da ${user.username}`);
        res.status(201).json({ roomId });

    } catch (error) {
        console.error('[RoomController] Errore creazione:', error.message);
        let statusCode = 500;
        if (['ROOM_NAME_REQUIRED', 'INVALID_MAX_PLAYERS', 'HOST_NOT_FOUND'].includes(error.message)) {
            statusCode = 400;
        }
        res.status(statusCode).json({ success: false, error: error.message });
    }
};

exports.checkRoom = async (req, res) => {
    try {
        const { gameId } = req.params; 
        const { user } = req.body;

        if (!user || !user.username) {
            return res.status(400).json({ message: "Dati utente mancanti." });
        }

        // 1. VERIFICA PERMESSI (Solo lettura)
        // Qui controlliamo se esiste, se è piena, etc.
        const accessCheck = await RoomService.checkRoomAccess(gameId, user.username);

        // Gestione Casi di Errore
        if (accessCheck.reason === 'ROOM_NOT_FOUND') {
            return res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false
            });
        }

        if (accessCheck.reason === 'ROOM_FULL') {
            return res.status(403).json({
                message: "La stanza è piena.",
                roomExists: true,
                isFull: true
            });
        }

        if (accessCheck.reason === 'GAME_ALREADY_STARTED') {
            return res.status(403).json({
                message: "La partita è già iniziata.",
                roomExists: true,
                gameStarted: true
            });
        }

        // 2. SUCCESSO (Sia nuovo accesso che rejoin)
        // IMPORTANTE: Non aggiungiamo qui l'utente al DB (manca il socketId).
        // Restituiamo 200 OK e i dati della stanza presi da accessCheck.room.
        // Il frontend userà questi dati per aprire il socket.
        
        console.log(`[RoomController] Accesso verificato per ${user.username} in ${gameId}`);

        return res.status(200).json({
            message: "Accesso consentito",
            canJoin: true,
            roomExists: true,
            // Dati necessari per la lobby frontend
            roomName: accessCheck.room.name,
            host: accessCheck.room.host,
            maxPlayers: accessCheck.room.maxPlayers,
            isRejoin: accessCheck.isRejoining
        });

    } catch (error) {
        console.error("Errore in checkRoom:", error);
        
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ message: "Utente non trovato." });
        }

        return res.status(500).json({ message: "Errore interno del server." });
    }
};