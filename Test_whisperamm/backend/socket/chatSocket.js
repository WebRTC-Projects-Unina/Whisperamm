module.exports = function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    console.log('Nuovo client connesso:', socket.id);

    socket.on('joinLobby', ({ gameId, username }) => {
      if (!gameId) return;
      socket.join(gameId);

      socket.to(gameId).emit('chatMessage', {
        from: 'system',
        text: `${username || 'Un giocatore'} è entrato nella lobby`,
        timestamp: Date.now(),
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

    socket.on('disconnect', () => {
      console.log('Client disconnesso:', socket.id);
    });
  });
};