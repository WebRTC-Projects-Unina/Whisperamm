const { lobbies, disconnectTimeouts, RECONNECT_TOLERANCE_MS, registerUserSocket, unregisterUserSocket } = require('./stateSocket');
const { Room } = require("../services/rooms"); // Assicurati che il percorso sia corretto
<<<<<<< HEAD
=======
const { getRedisClient } = require('../config_redis/redis');
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

// ✅ NUOVA FUNZIONE: Controlla se tutti gli utenti sono pronti (ESCLUSO L'ADMIN)
async function checkAllUsersReady(io, gameId) {
    const client = getRedisClient();
    const room = await Room.get(gameId);
    
    if (!room) return;

    // Filtra i giocatori ESCLUDENDO l'admin
    const playersToCheck = room.players.filter(p => p !== room.host);

    // Se non ci sono giocatori da controllare (solo admin), considera tutti pronti
    if (playersToCheck.length === 0) {
        io.to(gameId).emit('allUsersReady', { allReady: true });
        return true;
    }

    // Recupera lo stato "ready" di tutti i giocatori (ESCLUSO ADMIN)
    const readyStates = await Promise.all(
        playersToCheck.map(async (username) => {
            const isReady = await client.hGet(`user:${username}`, 'isready');
            return isReady === 'true';
        })
    );

    // Se TUTTI i giocatori (escluso admin) sono pronti
    const allReady = readyStates.every(state => state === true);
    
    io.to(gameId).emit('allUsersReady', { allReady });
    
    return allReady;
}

// ✅ NUOVA FUNZIONE: Ottiene lo stato "ready" di tutti i giocatori (ESCLUSO L'ADMIN)
async function getReadyStates(gameId) {
    const client = getRedisClient();
    const room = await Room.get(gameId);
    
    if (!room) return {};

    const readyStates = {};
    
    // Escludiamo l'admin dalla lista
    const playersToCheck = room.players.filter(p => p !== room.host);
    
    for (const username of playersToCheck) {
        const isReady = await client.hGet(`user:${username}`, 'isready');
        readyStates[username] = isReady === 'true';
    }

    // L'admin è sempre considerato "ready" (non ha il bottone)
    readyStates[room.host] = true;

    return readyStates;
}

>>>>>>> origin/PPS

// --- HANDLERS ---
async function handleJoinLobby(io, socket, { gameId, user }) {
    // Validazione input base
    if (!gameId || !user || !user.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti per l\'ingresso.' });
        return;
    }

    const username = user.username;

    // 1. GESTIONE RICONNESSIONE (STOP TIMER)
    // Se l'utente sta rientrando mentre correva il timer di disconnessione, lo fermiamo.
    if (disconnectTimeouts.has(username)) {
        clearTimeout(disconnectTimeouts.get(username));
        disconnectTimeouts.delete(username);
        console.log(`[Socket] ${username} rientrato in tempo. Timer annullato.`);
    }

    // 2. CONTROLLO ESISTENZA STANZA (REDIS)
    const room = await Room.get(gameId);
    if (!room) {
        socket.emit('lobbyError', { message: 'Stanza non trovata' });
        return;
    }


    //Secondo me qui potremmo togliere...già famo lato roomcontroller
    // 3. LOGICA DI ACCESSO (REDIS)
    const isUserAlreadyIn = await Room.isUserAlreadyIn(gameId, username);

    try {
        if (!isUserAlreadyIn) {
            // Nuovo giocatore: proviamo a scrivere su Redis
            await Room.addPlayer(gameId, username);
            console.log(`[Redis] Utente ${username} aggiunto alla stanza ${gameId}`);
        } else {
            // Giocatore esistente: è un reload o una riconnessione
            console.log(`[Socket] Utente ${username} già presente nel DB di ${gameId}.`);
        }
    } catch (error) {
        // Gestione errori (es. Stanza piena, Partita iniziata)
        socket.emit('lobbyError', { message: error.message });
        return;
    }

    // 4. SETUP SOCKET
    socket.data.gameId = gameId;
    socket.data.username = username;

    socket.join(gameId); // Iscrizione al canale Socket.IO

    // 5. GESTIONE CONNESSIONE UNICA (KICK VECCHIA SCHEDA)
    const { oldSocketId } = registerUserSocket(gameId, username, socket.id);

    // Se c'era un altro socket aperto per questo utente (diverso da questo), lo chiudiamo.
    if (oldSocketId && oldSocketId !== socket.id) {
        console.log(`[Socket] ${username} nuova connessione rilevata. Chiusura vecchio socket: ${oldSocketId}`);
        
        // Recuperiamo l'oggetto socket vecchio
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) {
            oldSocket.emit('lobbyError', { message: 'Hai aperto il gioco in un\'altra scheda. Questa connessione è stata chiusa.' });
            oldSocket.disconnect(true); // Disconnessione forzata
        }
    }

    // 6. NOTIFICHE AGLI ALTRI
    // Notifichiamo l'ingresso in chat solo se non era un semplice reload (cioè se non aveva socket attivi prima)
    if (!oldSocketId) {
        socket.to(gameId).emit('chatMessage', {
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });
    }

    // Inviamo SEMPRE la lista aggiornata a tutti (incluso chi è appena entrato)
    const updatedPlayers = await Room.getPlayers(gameId);
    io.to(gameId).emit('lobbyPlayers', { 
        players: updatedPlayers 
    });
}

async function notifyHostChange(io, gameId) {
    const room = await Room.get(gameId);
    if (room) {
        io.to(gameId).emit('hostChanged', { 
            newHost: room.host 
        });
    }
}

function handleDisconnect(io, socket) {
    const { gameId, username } = socket.data;
    
    // Se il socket non aveva dati (es. connesso ma mai entrato in lobby), ignoriamo
    if (!gameId || !username) return;

    // 1. RIMOZIONE DALLA MEMORIA LOCALE
    // Questa funzione ritorna TRUE solo se l'utente ha chiuso la scheda attiva.
    // Ritorna FALSE se è un vecchio socket (es. post-F5) e va ignorato.
    const shouldStartTimer = unregisterUserSocket(gameId, username, socket.id);

    if (!shouldStartTimer) {
        console.log(`[Socket] Disconnessione ignorata per ${username} (Socket obsoleto o sostituito).`);
        return;
    }

    console.log(`[Socket] ${username} offline da ${gameId}. Avvio timer di tolleranza (${RECONNECT_TOLERANCE_MS}ms)...`);

    // 2. AVVIO TIMER (REDIS)
    const timeout = setTimeout(async () => {
        console.log(`[Timer] Timeout scaduto per ${username}. Rimozione definitiva da Redis.`);
        
        try {
            // Rimuovi definitivamente da Redis
            const updatedRoom = await Room.removePlayer(gameId, username);

            // Se updatedRoom è null, la stanza è stata cancellata (era vuota)
            if (!updatedRoom) {
                console.log(`[Redis] Stanza ${gameId} svuotata ed eliminata.`);
                return; 
            }

            // Notifica cambio host
            if (updatedRoom.host !== username) {
                notifyHostChange(io, gameId);
            }

            // Notifica chi è rimasto
            io.to(gameId).emit('chatMessage', {
                from: 'system',
                text: `${username} ha lasciato la lobby`,
                timestamp: Date.now()
            });

            io.to(gameId).emit('lobbyPlayers', {
                players: updatedRoom.players
            });

        } catch (err) {
            console.error(`[Errore] Impossibile rimuovere ${username} dalla stanza ${gameId}:`, err);
        } finally {
            disconnectTimeouts.delete(username);
        }

    }, RECONNECT_TOLERANCE_MS);

    // Salviamo il timer per poterlo cancellare se l'utente torna
    disconnectTimeouts.set(username, timeout);
}

function handleChatMessage(io, socket, { gameId, text }) {
    const { username } = socket.data;
    
    // Controlli di sicurezza
    if (!gameId || !text || !username) return;

    io.to(gameId).emit('chatMessage', {
        from: username,
        text,
        timestamp: Date.now(),
    });
}


// ✅ NUOVO HANDLER: Utente dichiara di essere pronto
async function handleUserReady(io, socket, { gameId }) {
    const { username } = socket.data;
    
    if (!gameId || !username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }

    const client = getRedisClient();

    // Imposta isready a true
    await client.hSet(`user:${username}`, 'isready', 'true');

    console.log(`[Socket] ${username} è pronto in ${gameId}`);

    // Recupera lo stato di TUTTI
    const readyStates = await getReadyStates(gameId);

    // Notifica tutti nella stanza
    io.to(gameId).emit('userReadyUpdate', { 
        username,
        readyStates 
    });

    // Controlla se TUTTI sono pronti
    const allReady = await checkAllUsersReady(io, gameId);
    
    if (allReady) {
        io.to(gameId).emit('gameCanStart', { message: 'Tutti i giocatori sono pronti!' });
    }
}

// ✅ NUOVO HANDLER: Reset stato ready (quando torna alla lobby)
async function handleResetReady(io, socket, { gameId }) {
    const { username } = socket.data;
    
    if (!gameId || !username) return;

    const client = getRedisClient();
    await client.hSet(`user:${username}`, 'isready', 'false');

    console.log(`[Socket] ${username} ha resettato lo stato ready`);

    const readyStates = await getReadyStates(gameId);
    io.to(gameId).emit('userReadyUpdate', { 
        username,
        readyStates 
    });
}

// ✅ NUOVO HANDLER: Admin avvia la partita
async function handleGameStarted(io, socket, { gameId }) {
    const { username } = socket.data;
    const room = await Room.get(gameId);

    if (!room || room.host !== username) {
        socket.emit('lobbyError', { message: 'Solo l\'admin può avviare la partita.' });
        return;
    }

    console.log(`[Socket] Admin ${username} ha avviato la partita in ${gameId}`);

    // Notifica TUTTI nella stanza (incluso l'admin)
    io.to(gameId).emit('gameStarted', { gameId });
}
// --- EXPORT E REGISTRAZIONE ---

<<<<<<< HEAD
function attach(socket, io) {
    // 1. Ingresso in Lobby
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));

    // 2. Messaggi Chat
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));

    // 3. Disconnessione (Nativa di Socket.IO)
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };
=======
module.exports = function registerChatHandlers(io) {
    io.on('connection', (socket) => {
        
        // 1. Ingresso in Lobby
        socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
        
        // 2. Messaggi Chat
        socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
        
        // 3. Disconnessione (Nativa di Socket.IO)
        socket.on('disconnect', () => handleDisconnect(io, socket));

        // 4. Utente pronto
        socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
        // 5. Reset stato ready
        socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
        // 6. Admin avvia la partita
        socket.on('gameStarted', (payload) => handleGameStarted(io, socket, payload));
    });
};
>>>>>>> origin/PPS
