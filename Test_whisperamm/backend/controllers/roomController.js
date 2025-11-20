const {Room, RoomStatus} = require('../services/rooms');
const {User} = require('../services/user');

exports.createGame = async (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;
        
        // --- VERIFICA UTENTE ---
        if(!(await User.exists(user.username))) {
            return res.status(404).json({ message: "Admin partita non registrato!" });
        }
        
        // --- VALIDAZIONE INPUT ---
        if (!roomName || roomName.length) {
            if (!roomName || roomName.length < 3) {
                return res.status(400).json({ message: "Il nome della stanza deve essere di almeno 3 caratteri." });
            }
        }

        // --- CREAZIONE STANZA ---
        const roomId = await Room.create(roomName, user.username, maxPlayers, rounds);
        console.log(`[SERVER] Stanza ${roomId} creata con successo.`);

        res.status(201).json({ roomId: roomId });

    } catch (error) {
        console.error("Errore in createGame:", error);
        res.status(500).json({ message: "Errore interno del server." });
    }
}

exports.checkGameP = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { user } = req.body;

        console.log("CheckGameP called with gameId:", gameId, "and user:", user );

        // Controlla se l'utente esiste nel body
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
        if (!Room.exists(gameId)) {
            console.log(`[HTTP] Stanza ${gameId} NON trovata.`);
            // Invia 404 e FERMA L'ESECUZIONE
            return res.status(404).json({
                message: "Stanza non trovata o ID errato.",
                roomExists: false // Manda roomExist = false
            });
        }

        // Se arriviamo qui, la stanza esiste.
        console.log(`[HTTP-POST] Stanza ${gameId} trovata per ${user.id}.`);

        // Controlla se l'utente è già nella stanza
        if (isUserInRoom(gameId, user.id)) {
            console.log(`[HTTP-POST] Utente ${user.username} è già nella stanza ${gameId}.`);
            const room = getRoom(gameId);

            // Invia 200 OK, ma con un flag speciale.
            return res.status(200).json({
                message: "L'utente è già nella stanza.",
                roomExists: true,
                userAlreadyExists: true, // Possiamo usare questo flag per implementare un pop up diverso da STANZA NON ESISTE
                roomName: room.name,
                maxPlayers: room.maxPlayers
            });
        }

        //Controlla se la stanza è piena
        if (await Room.getNumberOfPlayers(gameId) >= await Room.getMaxPlayers(gameId)) {
            console.log(`[HTTP] Numero massimo di giocatori raggiunto.`);
            // Invia 403 (Proibito) e FERMA L'ESECUZIONE
            return res.status(403).json({
                message: "La stanza è piena.",
                roomExists: true,
                isFull: true // Possiamo usare questo flag per implementare un pop up diverso da STANZA NON ESISTE
            });
        }

        // Se arriviamo qui, la stanza esiste E non è piena
        // 3. Aggiungi l'utente
        console.log(`[HTTP] Aggiungo ${user.username} alla stanza ${gameId}`);
        await Room.addPlayer(gameId, user.username);
        
        // Invia 200 (OK) e FERMA L'ESECUZIONE
        return res.status(200).json({
            message: `Stanza trovata, utente ${user.username} aggiunto.`,
            roomExists: true,
            userAdded: true, // Un altro flag che può essere utile, l'utente è stato aggiunto, magari per mettere una schermata di benvenuto
            roomName: room.name,
            maxPlayers: room.maxPlayers
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
        if (!Room.exists(gameId)) {
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
