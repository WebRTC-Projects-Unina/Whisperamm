// Mappa globale: gameId -> Map(socketId -> username)
const lobbies = new Map();

module.exports = function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Nuovo client connesso:', socket.id);

    socket.on('joinLobby', ({ gameId, username }) => {
      if (!gameId) return;
      socket.join(gameId);

    const name = username || 'Un giocatore';
    
    // registra il giocatore nella lobby
    if (!lobbies.has(gameId)) {
      lobbies.set(gameId, new Map());
    }
    const lobby = lobbies.get(gameId);
    lobby.set(socket.id, name);

      socket.to(gameId).emit('chatMessage', {
        from: 'system',
        text: `${username || 'Un giocatore'} è entrato nella lobby`,
        timestamp: Date.now(),
      });

      // invia a tutti nella lobby la lista aggiornata dei giocatori
    const players = Array.from(lobby.values()); // solo username
    io.to(gameId).emit('lobbyPlayers', {
      gameId,
      players,
    });

      // salvo a livello di socket a quali lobby appartiene
    socket.data = socket.data || {};
    socket.data.gameId = gameId;
    });

    socket.on('chatMessage', ({ gameId, from, text }) => {
      if (!gameId || !text) return;

      io.to(gameId).emit('chatMessage', {
        from: from || 'anonimo',
        text,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnesso:', socket.id);

      // rimuovi il socket da tutte le lobby
      for (const [gameId, lobby] of lobbies.entries()) {
        if (lobby.has(socket.id)) {
          const name = lobby.get(socket.id);
          lobby.delete(socket.id);

          // se la lobby è vuota, puoi anche eliminarla
          if (lobby.size === 0) {
            lobbies.delete(gameId);
          }

          // avvisa la lobby che il giocatore è uscito
          io.to(gameId).emit('chatMessage', {
            from: 'system',
            text: `${name} ha lasciato la lobby`,
            timestamp: Date.now(),
          });

          // invia lista aggiornata
          io.to(gameId).emit('lobbyPlayers', {
            gameId,
            players: Array.from(lobby.values()),
          });
        }
      }
    });
  });
};