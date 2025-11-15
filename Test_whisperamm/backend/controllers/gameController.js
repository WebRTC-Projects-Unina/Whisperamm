const {createRoom, getRoom, roomExists, addUserToRoom, getNumberOfPlayers, getMaxPlayers} = require("../services/rooms");


exports.createGame = (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;

        if (!user || !user.username) {
            return res.status(401).json({ message: "Utente non autenticato." });
        }
        if (!roomName || roomName.length) {
            if (!roomName || roomName.length < 3) {
                return res.status(400).json({ message: "Il nome della stanza deve essere di almeno 3 caratteri." });
            }
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

exports.checkGameP = (req, res) => {
    try {
        const { gameId } = req.params;
        const { user } = req.body;

        // Controlla se l'utente esiste nel body
        if (!user || !user.username) {
            return res.status(400).json({ message: "Dati utente mancanti." });
        }

        console.log(`[HTTP] Ricevuta richiesta CHECK per ID: ${gameId}`);

        // Controlla se la stanza esiste
        if (!roomExists(gameId)) {
            console.log(`[HTTP] Stanza ${gameId} NON trovata.`);
            // Invia 404 e FERMA L'ESECUZIONE
            return res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false
            });
        }

        // Se arriviamo qui, la stanza esiste
        console.log(`[HTTP] Stanza ${gameId} trovata.`);

        // Controlla se la stanza è piena
        if (getNumberOfPlayers(gameId) >= getMaxPlayers(gameId)) {
            console.log(`[HTTP] Numero massimo di giocatori raggiunto.`);
            // Invia 403 (Proibito) e FERMA L'ESECUZIONE
            return res.status(403).json({
                message: "La stanza è piena.",
                roomExists: true // La stanza esiste, ma è piena
            });
        }

        // Se arriviamo qui, la stanza esiste E non è piena
        // 3. Aggiungi l'utente
        console.log(`[HTTP] Aggiungo ${user.username} alla stanza ${gameId}`);
        addUserToRoom(gameId, user);

        // Invia 200 (OK) e FERMA L'ESECUZIONE
        return res.status(200).json({
            message: `Stanza trovata, utente ${user.username} aggiunto.`,
            roomExists: true
        });

    } catch (error) {
        // Se qualsiasi cosa sopra fallisce (es. addUserToRoom lancia un errore)
        console.error("Errore in checkGame:", error);
        return res.status(500).json({ message: "Errore interno del server." });
    }
}

exports.checkGameG = (req, res) => {
    try {
        const { gameId } = req.params; // L'ID dall'URL
        console.log(`[HTTP] Ricevuta richiesta CHECK per ID: ${gameId}`);

        // controlla se l'ID esiste usando la funzione REALE
        if (roomExists(gameId)) {
            // Se esiste, aggiungi l'utente usando la funzione REALE
            console.log(`[HTTP] Stanza ${gameId} trovata.`);

            // Rispondi OK
            res.status(200).json({
                message: `Stanza trovata.`,
                roomExists: true
            });
        } else {
            // Se non esiste, rispondi 404
            console.log(`[HTTP] Stanza ${gameId} NON trovata.`);
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