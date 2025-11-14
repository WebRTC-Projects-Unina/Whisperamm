// Struttura dati: Map<gameId, Map<username, Set<socket.id>>>
const lobbies = new Map();

module.exports = function registerChatHandlers(io) {
    io.on('connection', (socket) => {
        console.log('Nuovo client connesso:', socket.id);

        socket.on('joinLobby', ({ gameId, username }) => {
            if (!gameId) return;

            const name = username;

            // --- MODIFICATO: Salva i dati sul socket per la disconnessione ---
            // Ci serve per sapere chi e da dove si disconnette
            socket.data = socket.data || {};
            socket.data.gameId = gameId;
            socket.data.username = name;

            // --- NUOVA LOGICA: Registra il giocatore per "presenza" ---

            // 1. Get o crea la lobby
            if (!lobbies.has(gameId)) {
                lobbies.set(gameId, new Map());
            }
            const lobby = lobbies.get(gameId);

            // 2. Get o crea il Set di connessioni per questo utente
            if (!lobby.has(name)) {
                lobby.set(name, new Set());
            }
            const connections = lobby.get(name);

            // 3. Controlla se è la sua prima connessione *prima* di aggiungerla
            const isFirstConnection = connections.size === 0;

            // 4. Aggiungi questo socket.id al Set dell'utente
            connections.add(socket.id);

            // 5. Unisciti alla "stanza" di socket.io per la chat
            socket.join(gameId);

            // --- MODIFICATO: Invia il messaggio solo se è il primo join ---
            if (isFirstConnection) {
                socket.to(gameId).emit('chatMessage', {
                    from: 'system',
                    text: `${name} è entrato nella lobby`,
                    timestamp: Date.now(),
                });
            }

            // --- MODIFICATO: Invia la lista di giocatori UNICI ---
            // Ora prendiamo le "keys" della mappa della lobby, che sono gli username
            const players = Array.from(lobby.keys());
            io.to(gameId).emit('lobbyPlayers', {
                gameId,
                players,
            });
        });

        socket.on('chatMessage', ({ gameId, from, text }) => {
            if (!gameId || !text) return;

            io.to(gameId).emit('chatMessage', {
                from: from || 'anonimo',
                text,
                timestamp: Date.now(),
            });
        });

        // --- LOGICA 'disconnect' COMPLETAMENTE RIFATTA ---
        // Molto più efficiente e corretta
        socket.on('disconnect', () => {
            console.log('Client disconnesso:', socket.id);

            // 1. Recupera i dati che abbiamo salvato sul socket
            const { gameId, username } = socket.data || {};

            // Se questo socket non era in una lobby, non fare nulla
            if (!gameId || !username) {
                return;
            }

            // 2. Trova la lobby e il Set di connessioni dell'utente
            const lobby = lobbies.get(gameId);
            if (!lobby) return;

            const connections = lobby.get(username);
            if (!connections) return;

            // 3. Rimuovi questo socket.id dal Set
            connections.delete(socket.id);

            // 4. CONTROLLO CHIAVE: se il Set è vuoto, l'utente è offline
            if (connections.size === 0) {
                // Rimuovi l'utente dalla mappa della lobby
                lobby.delete(username);

                console.log(`${username} ha chiuso l'ultima scheda. Uscito da ${gameId}`);

                // Avvisa la lobby che il giocatore è uscito
                io.to(gameId).emit('chatMessage', {
                    from: 'system',
                    text: `${username} ha lasciato la lobby`,
                    timestamp: Date.now(),
                });

                // Invia la lista aggiornata (ora senza di lui)
                const players = Array.from(lobby.keys());
                io.to(gameId).emit('lobbyPlayers', {
                    gameId,
                    players,
                });

                // (Opzionale) Pulisci la lobby se è l'ultimo giocatore
                if (lobby.size === 0) {
                    lobbies.delete(gameId);
                    console.log(`Lobby ${gameId} vuota, eliminata.`);
                }
            } else {
                // L'utente ha altre schede aperte, quindi è ancora nella lobby
                console.log(`${username} ha chiuso una scheda, ma è ancora in ${gameId}`);
            }
        });
    });
};