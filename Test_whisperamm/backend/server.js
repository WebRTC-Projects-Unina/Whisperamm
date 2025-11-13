const express = require('express');
const session = require('express-session'); // Importa express-session
const app = express();
const PORT = process.env.PORT || 8080;
const { randomUUID } = require('crypto'); // 'crypto' è un modulo built-in

// --- Database "finto" in memoria ---
const liveRooms = {};

// 1. Per parsare il JSON in arrivo dalle richieste POST
app.use(express.json());

// 2. Configurazione della sessione in memoria
// Questo è il "database in-memory" per le sessioni
app.use(session({
    secret: 'il-tuo-segreto-per-mister-white', // Una stringa segreta per firmare i cookie
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Metti 'true' se sei in HTTPS
        maxAge: 1000 * 60 * 60 * 24 // Cookie valido per 24 ore
    }
}));

// === Endpoint API per la Registrazione ===

/**
 * @route   POST /api/register
 * @desc    Registra un utente e lo salva nella sua sessione
 * @access  Publico
 */
app.post('/api/register', (req, res) => {
    const { username } = req.body;

    // Semplice validazione
    if (!username || username.trim().length < 3) {
        return res.status(400).json({ message: 'Username non valido. Servono almeno 3 caratteri.' });
    }

    // Qui "associamo" l'utente alla sessione
    // Il server ora "ricorda" questo utente grazie al cookie di sessione
    req.session.user = {
        id: req.session.id, // Possiamo usare l'ID di sessione come ID utente
        username: username.trim()
    };
    
    console.log(`Utente registrato: ${username} (ID: ${req.session.user.id})`);

    // Rimanda indietro l'utente registrato
    res.status(200).json({ 
        message: 'Registrazione avvenuta con successo!',
        user: req.session.user 
    });
});

app.post('/api/createGame', (req, res) => {
    // 1. Leggi i dati (roomName, user) inviati dal body della fetch
    const { roomName, user } = req.body;

    console.log(`[SERVER] Ricevuta richiesta per creare '${roomName}' da ${user.username}`);

    // 2. --- VALIDAZIONE DI SICUREZZA ---
    if (!user || !user.username) {
        // In un'app reale, qui controlleresti il TOKEN/SESSIONE, non l'oggetto user
        return res.status(401).json({ message: "Utente non autenticato." });
    }
    if (!roomName || roomName.length < 3) {
        return res.status(400).json({ message: "Il nome della stanza deve essere di almeno 3 caratteri." });
    }

    // 3. --- CREAZIONE STANZA ---
    // Genera un ID univoco e sicuro
    const newRoomId = randomUUID().slice(0, 6).toUpperCase(); 

    // Salva la stanza nel nostro "database"
    liveRooms[newRoomId] = {
        roomId: newRoomId,
        name: roomName,
        players: [user], // L'utente che l'ha creata è il primo
        host: user.username,
        createdAt: new Date()
    };
    
    console.log(`[SERVER] Stanza creata con ID: ${newRoomId}`);
    
    // 4. --- RISPOSTA AL CLIENT ---
    // Invia il JSON che 'Home.jsx' si aspetta per poter navigare
    // Lo status 201 significa "Risorsa Creata"
    res.status(201).json({ roomId: newRoomId });
});



/**
 * ROTTA 2: Controllo Esistenza Stanza
 * Chiamata da Home.jsx quando ci si unisce a una partita.
 */
app.get('/api/game/check/:gameId', (req, res) => {
    // 1. Leggi l'ID dall'URL (es. /api/game/check/ABCDE)
    const { gameId } = req.params;

    console.log(`[HTTP] Ricevuta richiesta CHECK per ID: ${gameId}`);

    // 2. Controlla se l'ID esiste nel nostro "database"
    if (liveRooms[gameId]) {
        // 3. Se esiste, rispondi OK
        // (In futuro potresti controllare qui se la stanza è piena)
        console.log(`[HTTP] Stanza ${gameId} trovata.`);
        res.status(200).json({ message: "Stanza trovata" });
    } else {
        // 4. Se non esiste, rispondi 404 (Not Found)
        console.log(`[HTTP] Stanza ${gameId} NON trovata.`);
        res.status(404).json({ message: "Stanza non trovata o ID errato." });
    }
});


//Qui andrà la Gestione di SOCKET.IO 


// Avvio del server
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});

// Nota: per ora non abbiamo ancora avviato Socket.IO.
// Lo aggiungeremo qui quando servirà per le stanze.