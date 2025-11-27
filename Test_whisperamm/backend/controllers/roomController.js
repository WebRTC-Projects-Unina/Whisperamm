// controllers/roomController.js
const RoomService = require('../services/roomService');

exports.createGame = async (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;
        
        // Validazione base dell'input
        if (!user || !user.username) {
            return res.status(400).json({ message: "Dati Admin mancanti."});
        }

        // Crea la stanza tramite il service
        const roomId = await RoomService.createRoom(
            roomName,
            user.username,
            maxPlayers,
            rounds
        );

        console.log(`[Controller] Stanza ${roomId} creata con successo.`);
        res.status(201).json({ roomId });

    } catch (error) {
        console.error('[RoomController] Errore creazione:', error.message);
            
            // Gestione errori specifici del Service
            let statusCode = 500;
            if (['ROOM_NAME_REQUIRED', 'INVALID_MAX_PLAYERS', 'HOST_NOT_FOUND'].includes(error.message)) {
                statusCode = 400;
            }

            res.status(statusCode).json({ 
                success: false, 
                error: error.message 
            });
    }
};

exports.checkRoom = async (req, res) => {
    try {
        const { gameId } = req.params; //Qua dovrebbe
        const { user } = req.body;

        // Validazione input
        if (!user || !user.username) {
            return res.status(400).json({ 
                message: "Dati utente mancanti." 
            });
        }

        // Verifica accesso alla stanza
        const accessCheck = await RoomService.checkRoomAccess(gameId, user.username);

        // Gestione dei vari casi
        if (accessCheck.reason === 'ROOM_NOT_FOUND') {
            return res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false
            });
        }

        if (accessCheck.reason === 'ALREADY_IN_ROOM') {
            return res.status(200).json({
                message: "L'utente è già nella stanza.",
                roomExists: true,
                userAlreadyExists: true,
                roomName: accessCheck.room.name,
                host: accessCheck.room.host,
                maxPlayers: accessCheck.room.maxPlayers
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

        // Se può entrare, aggiungi l'utente
        const result = await RoomService.addPlayerToRoom(gameId, user.username);

        console.log(`[Controller] Utente ${user.username} aggiunto alla stanza ${gameId}`);

        return res.status(200).json({
            message: `Benvenuto nella stanza!`,
            roomExists: true,
            userAdded: true,
            roomName: result.room.name,
            host: result.room.host,
            maxPlayers: result.room.maxPlayers
        });

    } catch (error) {
        console.error("Errore in checkRoom:", error);
        
        if (error.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ 
                message: "Utente non trovato." 
            });
        }

        return res.status(500).json({ 
            message: "Errore interno del server." 
        });
    }
};

// ✅ NUOVO