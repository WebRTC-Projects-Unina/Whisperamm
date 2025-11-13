const express = require('express');
const session = require('express-session'); // Importa express-session
const app = express();
const PORT = process.env.PORT || 8080;

const cors = require('cors');
app.use(cors());

app.use(express.json());

// Configurazione della sessione in memoria
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

// Importo le rotte
const routes = require('./routes/userRoutes');
routes(app); // Registra le rotte

// Avvio del server
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});

/**
 * @route   POST /api/register
 * @desc    Registra un utente e lo salva nella sua sessione
 * @access  Pubblico
 */

/**
 * @route POST /api/createGame
 * @desc Crea una partita, genera il codice passandolo a chi ha fatto la richiesta
 * @access Pubblico
 */

/**
 * @route GET /api/game/check/:gameId
 * @desc Check se la stanza esiste, se si aggiunge il giocatore negli utenti della stanza
 * @access Pubblico
 */