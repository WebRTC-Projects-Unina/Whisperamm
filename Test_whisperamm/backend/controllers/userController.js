const {createRoom, getRoom, roomExists, addUserToRoom} = require("../services/rooms");

exports.register = (req, res) => {
    console.log(req.body);
    const { username } = req.body;

    // Semplice validazione
    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username non valido. Servono almeno 3 caratteri.' });
    }

    // La logica della sessione funziona ESATTAMENTE come prima
    // perché 'req' è lo stesso oggetto
    req.session.user = {
        id: req.session.id,
        username: username.trim()
    };

    console.log(`Utente registrato: ${username} (ID: ${req.session.user.id})`);

    // Rimanda indietro l'utente registrato
    res.status(200).json({
        message: 'Registrazione avvenuta con successo!',
        user: req.session.user
    });
}

exports.createGame = (req, res) => {
    try {
        const { roomName, user, maxPlayers, rounds } = req.body;

        if (!user || !user.username) {
            return res.status(401).json({ message: "Utente non autenticato." });
        }
        if (!roomName || roomName.length < 3 || maxPlayers <= 0 || maxPlayers > 12 || rounds < 1 || rounds > 10) {
            if (!roomName || roomName.length < 3) {
                return res.status(400).json({ message: "Il nome della stanza deve essere di almeno 3 caratteri." });
            }
            else if (maxPlayers <= 1 || maxPlayers > 12) {
                return res.status(400).json({ message: "Il numero di giocatori dev'essere compreso tra 2 e 12." });
            }
            else if (rounds < 1 || rounds > 10) {
                return res.status(400).json({ message: "Il numero di round dev'essere compreso tra 1 e 10." });
            }
            return;
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

exports.checkGame = (req, res) => {
    try {
        // --- 2. LEGGI I DATI CORRETTAMENTE ---
        const { gameId } = req.params; // 1. L'ID dall'URL
        const { user } = req.body;     // 2. L'utente dal BODY

        console.log(`[HTTP] Ricevuta richiesta CHECK per ID: ${gameId}`);

        // 3. Controlla se l'ID esiste usando la funzione REALE
        if (roomExists(gameId)) {
            // 4. Se esiste, aggiungi l'utente usando la funzione REALE
            console.log(`[HTTP] Stanza ${gameId} trovata.`);
            console.log(`[HTTP] Aggiungo ${user.username} alla stanza ${gameId}`);

            // Aggiungi l'utente allo store
            addUserToRoom(gameId, user);

            // Rispondi OK
            res.status(200).json({
                message: `Stanza trovata, utente ${user.username} aggiunto.`,
                roomExists: true
            });
        } else {
            // 5. Se non esiste, rispondi 404
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



exports.getMe = (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Non autenticato' });
    }
    res.json({ user: req.session.user });
  };