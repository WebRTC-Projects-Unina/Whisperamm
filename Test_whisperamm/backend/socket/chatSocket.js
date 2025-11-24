const { lobbies, disconnectTimeouts, RECONNECT_TOLERANCE_MS, registerUserSocket, unregisterUserSocket } = require('./stateSocket');
const { Room } = require("../services/rooms"); // Assicurati che il percorso sia corretto

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

// --- EXPORT E REGISTRAZIONE ---

module.exports = function registerChatHandlers(io) {
    io.on('connection', (socket) => {
        
        // 1. Ingresso in Lobby
        socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
        
        // 2. Messaggi Chat
        socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
        
        // 3. Disconnessione (Nativa di Socket.IO)
        socket.on('disconnect', () => handleDisconnect(io, socket));
    });
};