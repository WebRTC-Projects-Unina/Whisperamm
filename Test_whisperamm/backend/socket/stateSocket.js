// --- STATO IN MEMORIA (SOLO PER SOCKET ATTIVI) ---
// Struttura: Map<gameId, Map<username, socketId>>
const lobbies = new Map();  //Da domandare a SPR se è giusto oppure anche questa va in Redis

// Map<username, Timeout> per gestire il timer di disconnessione
const disconnectTimeouts = new Map();
const RECONNECT_TOLERANCE_MS = 5000; // Diamo al massimo 5 secondi per ricaricare la pagina

// --- FUNZIONE DI SUPPORTO ---

//Registra il nuovo socket per l'utente e restituisce l'eventuale socket vecchio.
function registerUserSocket(gameId, username, newSocketId) {
    //Se non esiste l'entry della lobby in memoria, la creiamo
    if (!lobbies.has(gameId)) {
        lobbies.set(gameId, new Map())  //creo la mappa per quel gameId
    }

    //Recupuro ciò che c'è in memoria per quella lobby
    //Sarà undefined se è la prima connessione
    const lobby = lobbies.get(gameId); // Prendo la mappa della lobby
    const oldSocketId = lobby.get(username); // Prendo l'eventuale socket vecchio
    lobby.set(username, newSocketId); // Aggiorno con il nuovo socketId, anche se è lo stesso?
    
    /*
        Questo utile perchè se l'utente ricarica la pagina, il socketId cambia.
        In questo modo manteniamo in memoria solo l'ultimo socketId attivo per quell'utente.
        Se l'utente apre una nuova scheda, il vecchio socketId rimane in memoria,
        e potremo usarlo per "kickarlo" più tardi.
    */

    return { oldSocketId }; // Ritorno l'eventuale socket vecchio
}

//Rimuove il socket dalla memoria locale SOLO se corrisponde a quello attivo.
function unregisterUserSocket(gameId, username, socketIdToRem) {
    const lobby = lobbies.get(gameId);
    if (!lobby) return false;

    const currentActiveSocketId = lobby.get(username);

    // PROTEZIONE F5 E VECCHIE SCHEDE
    // Se il socket che si sta disconnettendo NON è quello che abbiamo salvato in memoria,
    // significa che è una vecchia scheda sovrascritta. Non rimuoviamo l'utente.
    if (socketIdToRem !== currentActiveSocketId) {
        return false; // Non fare nulla
    }

    // Se è il socket corrente, rimuoviamo l'utente dalla mappa locale
    lobby.delete(username);
    
    // Pulizia della mappa lobby se vuota
    if (lobby.size === 0) {
        lobbies.delete(gameId);
    }

    return true; // Procedi con il timer di disconnessione
}

module.exports = { lobbies, registerUserSocket, unregisterUserSocket, disconnectTimeouts, RECONNECT_TOLERANCE_MS };