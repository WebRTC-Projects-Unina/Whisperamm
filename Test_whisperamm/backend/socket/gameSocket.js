const GameService = require('../services/gameService');

/**
 * Gestisce l'evento di lancio dadi
 */
async function handleDiceRoll(io, socket) {
    const { username, gameId } = socket.data;

    // 1. Validazione input base
    if (!gameId || !username) {
        return socket.emit('error', { message: "Dati mancanti (gameId o username)" });
    }

    try {
        console.log(`[Socket] ${username} lancia i dadi in ${gameId}`);

        // 2. Chiama il Service
        const result = await GameService.rollDice(gameId, username);

        // 3. Risposta al singolo utente (opzionale, se vuoi dare feedback immediato)
        // socket.emit('diceRollSuccess', { myDice: result.dice });

        // 4. Broadcast alla stanza: Tizio ha lanciato i dadi
        io.to(gameId).emit('playerRolled', {
            username: username,
            dice: result.dice,
            total: result.total
        });

        // 5. Se tutti hanno finito, notifica il cambio di stato
        if (result.nextStateTriggered) {
            // Recuperiamo lo stato aggiornato (con l'ordine dei turni)
            const fullGame = await GameService.getGameSnapshot(gameId);
            
            io.to(gameId).emit('gameStatusChanged', {
                status: result.newStatus,
                players: fullGame.players // Ora contengono l'ordine aggiornato
            });
            
            console.log(`[Game ${gameId}] Tutti hanno lanciato. Nuovo stato: ${result.newStatus}`);
        }

    } catch (error) {
        console.error(`[DiceRoll Error] ${error.message}`);
        socket.emit('gameError', { message: error.message });
    }
}

function attach(socket, io) {
    // Nota: Assicurati che il socket abbia fatto join alla room `gameId` in fase di connessione o setup
    socket.on('diceRoll', () => handleDiceRoll(io, socket));
}

module.exports = { attach };