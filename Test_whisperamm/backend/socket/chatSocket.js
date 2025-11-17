const {
    getRoom,
    addUserToRoom,
    removeUserFromRoom,
    roomExists,
} = require("../services/rooms");

// --- MODIFICA COMMENTO ---
// Struttura dati: Map<gameId, Map<userId, Set<socket.id>>>
const lobbies = new Map();

module.exports = function registerChatHandlers(io) {
    // Attendiamo il connection event
    io.on('connection', (socket) => {
        console.log('Nuovo client connesso:', socket.id);

        socket.on('joinLobby', ({ gameId, user }) => {
            if (!gameId || !user) return;

            const name = user.username;
            const userId = user.id;

            // 1. Controlla lo stato UFFICIALE
            const room = getRoom(gameId);
            if (!room) {
                socket.emit('lobbyError', { message: 'Stanza non trovata' });
                return;
            }

            // Controlliamo se l'utente è già nella stanza
            const isUserAlreadyIn = room.players.some(p => p.id === userId);
            const isRoomFull = room.players.length >= room.maxPlayers;

            // Se la stanza è piena E l'utente non è già dentro, rifiuta.
            if (isRoomFull && !isUserAlreadyIn) {
                socket.emit('lobbyError', { message: 'La stanza è piena.' });
                return;
            }
            // --- FINE LOGICA MIGLIORATA ---


            // 2. Aggiungi l'utente alla lista UFFICIALE
            // (La funzione gestisce già i duplicati, quindi è sicuro)
            addUserToRoom(gameId, user);
            console.log(`[Socket] Utente ${name} aggiunto in ${gameId}`);

            // 3. Salva i dati sul socket per la disconnessione
            socket.data.gameId = gameId;
            socket.data.username = name;
            socket.data.userId = userId;

            // 4. Gestisci la PRESENZA (Usando l'ID)
            if (!lobbies.has(gameId)) lobbies.set(gameId, new Map());
            const lobby = lobbies.get(gameId);

            if (!lobby.has(userId)) lobby.set(userId, new Set());
            const connections = lobby.get(userId);

            const isFirstConnection = connections.size === 0;
            connections.add(socket.id);
            socket.join(gameId);

            // 5. Invia i messaggi
            if (isFirstConnection) {
                socket.to(gameId).emit('chatMessage', {
                    from: 'system',
                    text: `${name} è entrato nella lobby`,
                });
            }

            // 6. Invia la lista giocatori UFFICIALE
            // Questa riga ora verrà eseguita anche se l'utente era già dentro
            const players = getRoom(gameId).players;
            io.to(gameId).emit('lobbyPlayers', {
                gameId,
                players: players.map(p => p.username), // Invia solo i nomi
            });
        });

        // --- EVENTO DISCONNECT ---
        socket.on('disconnect', () => {
            const { gameId, username, userId } = socket.data || {};

            if (!gameId || !username || !userId) return;

            const lobby = lobbies.get(gameId);
            if (!lobby) return;
            const connections = lobby.get(userId);
            if (!connections) return;

            // Rimuovi dalla PRESENZA
            connections.delete(socket.id);

            // Se era l'ultima scheda
            if (connections.size === 0) {
                console.log(`${username} (ID: ${userId}) è offline da ${gameId}`);

                // Rimuovi l'utente dalla mappa delle presenze
                lobby.delete(userId);

                // Rimuovi l'utente dalla lista UFFICIALE
                const updatedRoom = removeUserFromRoom(gameId, userId);

                // Se la stanza è stata eliminata (era l'ultimo giocatore)
                if (!updatedRoom) {
                    console.log(`Stanza ${gameId} vuota, eliminata.`);
                    lobbies.delete(gameId); // Pulisci anche la mappa delle presenze
                    return;
                }

                // Invia l'aggiornamento a chi è rimasto
                io.to(gameId).emit('chatMessage', {
                    from: 'system',
                    text: `${username} ha lasciato la lobby`,
                });

                // Invia la nuova lista giocatori UFFICIALE
                const players = updatedRoom.players;
                io.to(gameId).emit('lobbyPlayers', {
                    gameId,
                    players: players.map(p => p.username),
                });

                // (Opzionale) Invia il nuovo host se è cambiato
                // io.to(gameId).emit('hostChanged', { newHost: updatedRoom.host });
            }
        });

        // --- EVENTO CHAT ---
        socket.on('chatMessage', ({ gameId, text }) => {
            const { username } = socket.data || {};

            if (!gameId || !text || !username) return; // Non inviare se il mittente non è valido

            io.to(gameId).emit('chatMessage', {
                from: username, // Preso da socket.data
                text,
                timestamp: Date.now(),
            });
        });

    });
};