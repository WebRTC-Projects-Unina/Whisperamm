const {
    getRoom,
    addUserToRoom,
    removeUserFromRoom,
    roomExists,
} = require("../services/rooms");
// Struttura dati: Map<gameId, Map<username, Set<socket.id>>>
const lobbies = new Map();

module.exports = function registerChatHandlers(io) {
    // Attendiamo il connection event
    io.on('connection', (socket) => {
        console.log('Nuovo client connesso:', socket.id);
        // A questo punto possiamo leggere il payload della socket per capire il tipo di messaggio

        socket.on('joinLobby', ({ gameId, user }) => {
            // Errore: l'utente non ha inviato i dati
            if (!gameId || !user) return;

            const name = user.username;
            const userId = user.id; // <-- CI SERVE L'ID!

            // 1. Controlla lo stato UFFICIALE
            const room = getRoom(gameId);
            if (!room) {
                socket.emit('lobbyError', { message: 'Stanza non trovata' });
                return;
            }

            // Controlla se è piena (logica dal tuo file!)
            if (room.players.length >= room.maxPlayers) {
                socket.emit('lobbyError', { message: 'Stanza piena' });
                return;
            }

            // 2. Aggiungi l'utente alla lista UFFICIALE
            // (la tua funzione addUserToRoom gestisce già i duplicati!)
            addUserToRoom(gameId, user);
            console.log('Client joined');

            // 3. Salva i dati sul socket per la disconnessione
            socket.data.gameId = gameId;
            socket.data.username = name;
            socket.data.userId = userId; // <-- SALVA ANCHE L'ID

            // 4. Gestisci la PRESENZA (il codice WebSocket di prima)
            if (!lobbies.has(gameId)) lobbies.set(gameId, new Map());
            const lobby = lobbies.get(gameId);
            if (!lobby.has(name)) lobby.set(name, new Set());
            const connections = lobby.get(name);

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
            const players = getRoom(gameId).players; // Prende la lista aggiornata
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
            const connections = lobby.get(username);
            if (!connections) return;

            // Rimuovi dalla PRESENZA
            connections.delete(socket.id);

            // Se era l'ultima scheda
            if (connections.size === 0) {
                console.log(`${username} (ID: ${userId}) è offline da ${gameId}`);

                // Rimuovi l'utente dalla mappa delle presenze
                lobby.delete(username);

                // 1. Rimuovi l'utente dalla lista UFFICIALE
                const updatedRoom = removeUserFromRoom(gameId, userId);

                // Se la stanza è stata eliminata (era l'ultimo giocatore)
                if (!updatedRoom) {
                    console.log(`Stanza ${gameId} vuota, eliminata.`);
                    lobbies.delete(gameId); // Pulisci anche la mappa delle presenze
                    return;
                }

                // 2. Invia l'aggiornamento a chi è rimasto
                io.to(gameId).emit('chatMessage', {
                    from: 'system',
                    text: `${username} ha lasciato la lobby`,
                });

                // 3. Invia la nuova lista giocatori UFFICIALE
                const players = updatedRoom.players;
                io.to(gameId).emit('lobbyPlayers', {
                    gameId,
                    players: players.map(p => p.username),
                });

                // (Opzionale) Invia il nuovo host se è cambiato
                // io.to(gameId).emit('hostChanged', { newHost: updatedRoom.host });
            }
        });

        socket.on('chatMessage', ({ gameId, from, text }) => {
            if (!gameId || !text) return;

            io.to(gameId).emit('chatMessage', {
                from: from || 'anonimo',
                text,
                timestamp: Date.now(),
            });
        });


    });
};