const express = require('express');
const session = require('express-session'); // Importa express-session
const app = express();
const PORT = process.env.PORT || 8080;

// === Middleware ===

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
    console.log(`DEBUG -- Sessione creata con ID: ${req.session.id}`);
    console.log(`Utente registrato: ${username} (ID: ${req.session.user.id})`);

    // Rimanda indietro l'utente registrato
    res.status(200).json({ 
        message: 'Registrazione avvenuta con successo!',
        user: req.session.user 
    });
});


// Avvio del server
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});

// Nota: per ora non abbiamo ancora avviato Socket.IO.
// Lo aggiungeremo qui quando servirà per le stanze.