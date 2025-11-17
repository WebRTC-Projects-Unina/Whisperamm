const {createRoom, getRoom, roomExists, addUserToRoom, getNumberOfPlayers, getMaxPlayers, isUserInRoom} = require("../services/rooms");
const { validateRoomName,validateRoomId } = require("../utils/validators");


exports.createGame = (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;

        if (!user || !user.username) {
            return res.status(401).json({ message: "Utente non autenticato." });
        }

        const validation = validateRoomName(roomName);
        if (!validation.valid) {
            console.log("Nome stanza non valido:", validation.message);
            return res.status(400).json({ message: validation.message });
        }

        // --- CREAZIONE STANZA ---
        // Ora 'createRoom' è una funzione REALE importata dallo store
        const roomId = createRoom(roomName, user, maxPlayers, rounds);
        console.log(`[SERVER] Stanza ${roomId} creata con successo in RAM.`);

        res.status(201).json({ roomId: roomId });

    } catch (error) {
        console.error("Errore in createGame:", error);
        res.status(500).json({ message: "Errore interno del server." });
    }
}

// Controlla se la stanza esiste -> Se non esiste roomExist = false
// Controlla se l'utente che ha fatto la richiesta è già nella stanza -> Se si userAlreadyExists = true
// Controlla se la stanza è piena -> Se è piena isFull = true
// Quando aggiunge l'utente nuovo -> userAdded = true
exports.checkGameP = (req, res) => {
    try {
        const { gameId } = req.params;
        const { user } = req.body;

        // Controlla dati utente
        if (!user || !user.username) {
            return res.status(400).json({ message: "Dati utente mancanti." });
        }
        const validation = validateRoomId(gameId);
        if (!validation.valid) {
            console.log("ID stanza non valido:", validation.message);
            return res.status(400).json({ message: validation.message });
        }

        console.log(`[HTTP-POST] Ricevuta richiesta CHECK per ID: ${gameId}`);

        // Controlla se la stanza esiste
        if (!roomExists(gameId)) {
            console.log(`[HTTP-POST] Stanza ${gameId} NON trovata.`);
            return res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false // Manda roomExist = false
            });
        }

        // Se arriviamo qui, la stanza esiste.
        console.log(`[HTTP-POST] Stanza ${gameId} trovata.`);

        // Controlla se l'utente è già nella stanza
        if (isUserInRoom(gameId, user.id)) {
            console.log(`[HTTP-POST] Utente ${user.username} è già nella stanza ${gameId}.`);
            // Invia 200 OK, ma con un flag speciale.
            return res.status(200).json({
                message: "L'utente è già nella stanza.",
                roomExists: true,
                userAlreadyExists: true // Possiamo usare questo flag per implementare un pop up diverso da STANZA NON ESISTE
            });
        }

        // Controlla se la stanza è piena
        if (getNumberOfPlayers(gameId) >= getMaxPlayers(gameId)) {
            console.log(`[HTTP-POST] Numero massimo di giocatori raggiunto.`);
            return res.status(403).json({
                message: "La stanza è piena.",
                roomExists: true,
                isFull: true // Possiamo usare questo flag per implementare un pop up diverso da STANZA NON ESISTE
            });
        }

        // Se arrivo qui, la stanza esiste, non è piena e l'utente non c'è.
        // Aggiungi l'utente.
        console.log(`[HTTP-POST] Aggiungo ${user.username} alla stanza ${gameId}`);
        addUserToRoom(gameId, user);

        // Invia 200 OK (Successo standard)
        return res.status(200).json({
            message: `Stanza trovata, utente ${user.username} aggiunto.`,
            roomExists: true,
            userAdded: true // Un altro flag che può essere utile, l'utente è stato aggiunto, magari per mettere una schermata di benvenuto
        });

    } catch (error) {
        console.error("Errore in checkGame:", error);
        return res.status(500).json({ message: "Errore interno del server." });
    }
}

// Controlla solamente se la stanza esiste
exports.checkGameG = (req, res) => {
    try {
        const { gameId } = req.params; // L'ID dall'URL
        console.log(`[HTTP-GET] Ricevuta richiesta CHECK per ID: ${gameId}`);

        const validation = validateRoomId(gameId);
        if (!validation.valid) {
            console.log("ID stanza non valido:", validation.message);
            return res.status(400).json({ message: validation.message });
        }

        // controlla se l'ID esiste usando la funzione REALE
        if (roomExists(gameId)) {
            // Se esiste, aggiungi l'utente usando la funzione REALE
            console.log(`[HTTP-GET] Stanza ${gameId} trovata.`);

            // Rispondi OK
            res.status(200).json({
                message: `Stanza trovata.`,
                roomExists: true
            });
        } else {
            // Se non esiste, rispondi 404
            console.log(`[HTTP-GET] Stanza ${gameId} NON trovata.`);
            res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false
            });
        }
    } catch (error) {
        console.error("Errore in checkGame:", error);
        res.status(500).json({ message: "Errore interno del server." });
    }
}