// chatSocket.js
const { lobbies, disconnectTimeouts, RECONNECT_TOLERANCE_MS, registerUserSocket, unregisterUserSocket } = require('./stateSocket');
const RoomService = require('../services/roomService');
const UserService = require('../services/userService');
const SocketService = require('../services/socketService');
const NotificationService = require('../services/notificationService')
// --- HANDLERS ---
async function handleJoinLobby(io, socket, { roomId, user }) {
    // 1. Validazione input base
    if (!roomId || !user || !user.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti per l\'ingresso.' });
        return;
    }

    const username = user.username;

    try {
        
        // 2. SETUP SOCKET - Iscrizione dell'utente (la sua connessione) al canale roomId
        socket.data.roomId = roomId;
        socket.data.username = username;
        socket.join(roomId);
        
        // 3. LOGICA DI ACCESSO
        // 3.1 Check per capire se ti stai riconnettendo oppure è una nuova connessione
        // 3.2 Upsert per la gestione delle entry, ma la connessione della socket al canale è già avvenuta
        await SocketService.registerConnection(roomId, username, socket.id); 
        
         //Capire se serve oldSocket.disconnect(true), in teoria dovrebbe succedere nell'handleDisconnect, perchè dovrebbe rimanere aperta?
       
    } catch (error) {
        socket.emit('lobbyError', { message: error.message });
        socket.disconnect(); // Disconnettiamo se non può entrare logicamente
        return;
    }

    // 4. Messaggio di Sistema in Broadcast
        NotificationService.broadcastToRoom(io,roomId,'chatMessage',{
            from: 'system',
            text: `${username} è entrato nella lobby`,
            timestamp: Date.now()
        });


    // Inviamo la lista aggiornata a tutti
    const updatedPlayers = await RoomService.getPlayers(roomId);
    const readyStates = await RoomService.getReadyStates(roomId);
    NotificationService.broadcastToRoom(io,roomId,'lobbyPlayers',{ 
        players: updatedPlayers,
        readyStates
    });
    console.log(`[ChatSocket] ${username} Ha stabilito una connessione WebSocket con la ${roomId}`);
}


async function handleDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    
    console.log("disconnessione..")

    if (!roomId || !username) return;

    try{
        //1. Disaccoppiare username-socket da Room:sockets, ma teniamo comunque l'username nella lista delle Socket, 
        // nel caso di re-join semplicemente riassociamo quell'username ad un altro socket-id con la upsert!
        const isCurrentSocket = await SocketService.unregisterConnection(roomId, username, socket.id);
        if (!isCurrentSocket) {
            console.log(`[ChatSocket] Disconnessione ignorata per ${username} (Socket obsoleto)`);
            return;
        }
        
        //2. Rimozione dalla struttura Room:players
        const {updatedRoom,hostChanged,deletedRoom} = await RoomService.removePlayerFromRoom(roomId, username);

        //Internamente, removePlayerFromRoom verifica anche se 
        //era l'ultimo utente nella lobby e nel caso elimina
        if (deletedRoom) {
            console.log(`[ChatSocket] Stanza ${roomId} eliminata (vuota).`);
            return; 
        }

        // 3. Notifiche da inviare ai client
        // 3.1 Cambio host se avviene, la modifica interna la fa sempre removePlayerFromRoom
        // 3.2 Messaggio in Chat del [System]
        // 3.3 Nuova lista di players da displayare

        // Se arriviamo qui, deletedRoom è false, quindi updatedRoom ESISTE SICURAMENTE.
        if(hostChanged){
            console.log("Nuovo host:", updatedRoom.host); // Ora questo non darà errore
            NotificationService.broadcastToRoom(io,roomId,'hostChanged',{newHost: updatedRoom.host});
        }
        NotificationService.broadcastToRoom(io,roomId,'chatMessage',{
            from: 'system',
            text: `${username} ha lasciato la lobby`,
            timestamp: Date.now()
        });

        updatedRoom.players.forEach(element => {
            console.log("player: "+element)
        });
       
        NotificationService.broadcastToRoom(io,roomId,'lobbyPlayers',{
            players: updatedRoom.players
        });


        console.log(`[Socket] ${username} offline da ${roomId}.`);

    }catch(err){
        console.error(`[Errore] Rimozione ${username} da ${roomId}:`, err);
    }

    // A quanto pare qui non c'è la necessità di mettere socket.leave, perchè al socket.disconnect
    // ricevuto dal front-end, qui lo fa automaticamente
} 




function handleChatMessage(io, socket, { roomId, text }) {
    const { username } = socket.data;
    
    if (!roomId || !text || !username) return;

    NotificationService.broadcastToRoom(io,roomId,'chatMessage',{
        from: username,
        text,
        timestamp: Date.now(),
    });
}

// HANDLER: Utente dichiara di essere pronto
async function handleUserReady(io, socket, { roomId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }

    try {
        // Imposta isready a true tramite Service
        await UserService.setUserReady(username, true);

        console.log(`[Service] ${username} è pronto in ${roomId}`);

        // Recupera lo stato di TUTTI
        const readyStates = await RoomService.getReadyStates(roomId);

        // Notifica tutti nella stanza
        NotificationService.broadcastToRoom(io,roomId,'userReadyUpdate',{ 
            username,
            readyStates 
        });


        // PROSSIMA COSA DA SISTEMARE
        // Controlla se TUTTI sono pronti
        const { allReady } = await RoomService.checkAllUsersReady(roomId); //True se tutti sono pronti..
        io.to(roomId).emit('allUsersReady', {allReady }); //Forse non serve mi sa
        
        if (allReady) {
            io.to(roomId).emit('gameCanStart', { 
                message: 'Tutti i giocatori sono pronti!' 
            });
        }
    } catch (err) {
        console.error(`[Errore] handleUserReady:`, err);
        socket.emit('lobbyError', { message: 'Errore durante l\'aggiornamento dello stato.' });
    }
}

// HANDLER: Reset stato ready -- Non è stata implementata in frontend
async function handleResetReady(io, socket, { roomId }) {
    const { username } = socket.data;
    
    if (!roomId || !username) return;

    try {
        await UserService.setUserReady(username, false);

        console.log(`[Service] ${username} ha resettato lo stato ready`);

        const readyStates = await RoomService.getReadyStates(roomId);
        
        io.to(roomId).emit('userReadyUpdate', { 
            username,
            readyStates 
        });

        // Notifica che NON tutti sono più pronti
        io.to(roomId).emit('allUsersReady', { allReady: false });
        
    } catch (err) {
        console.error(`[Errore] handleResetReady:`, err);
    }
}

// --- EXPORT E REGISTRAZIONE ---
function attach(socket, io) {
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    socket.on('leaveLobby', () => handleLeaveLobby(io, socket));
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };