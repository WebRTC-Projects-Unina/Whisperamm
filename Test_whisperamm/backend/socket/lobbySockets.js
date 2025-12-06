// lobbySockets.js
const RoomService = require('../services/roomService');
const UserService = require('../services/userService');
const SocketService = require('../services/socketService');
const NotificationService = require('../services/notificationService');
const { Room } = require('../models/Room');

// --- HELPER ---
async function broadcastFullState(io, roomId) {
    try {
        const [players, readyStates, checkReady, host] = await Promise.all([
            RoomService.getPlayers(roomId),
            RoomService.getReadyStates(roomId),
            RoomService.checkAllUsersReady(roomId),
            RoomService.getHost(roomId) 
        ]);

        if (!host) return;

        NotificationService.broadcastToRoom(io, roomId, 'lobbyState', {
            players,
            readyStates,
            allReady: checkReady.allReady,
            host 
        });

    } catch (error) {
        console.error(`[BroadcastFullError] Room ${roomId}:`, error);
    }
}

// --- HANDLERS ---
async function handleJoinLobby(io, socket, { roomId, user }) {
    if (!roomId || !user?.username) {
        socket.emit('lobbyError', { message: 'Dati mancanti.' });
        return;
    }
    const username = user.username;

    try {
        //Connessione effettiva alla room identificata da roomID
        socket.data.roomId = roomId;
        socket.data.username = username;
        socket.join(roomId);
        
        // 1. Check
        const access = await RoomService.checkRoomAccess(roomId, username); 
        //Forse lo fa 2 volte considerando il check in control room
        if (!access.canJoin) {
            socket.emit('lobbyError', { message: access.reason });
            socket.disconnect();
            return;
        }

        // 2. Transazione (ritorna { added, isRejoin, room })
        const result = await RoomService.addPlayerToRoom(roomId, username, socket.id); 

        // 3. Messaggio Personalizzato in chat
        if (result.isRejoin) {
            // L'utente aveva una entry nella socket map -> Rejoin

            //Ulteriore check se sta in game..nel caso gli devi girare Start!
            const gameStarted = await RoomService.checkGameStarted(roomId);
            if(gameStarted){
                //Triggeriamo il front-end del rejoiner a far caricare game, ma dobbiamo anche mandargli i dati della partita
                await NotificationService.sendToUser(io,roomId,username,'gameLoading','')
                //Qua dobbiamo mandare anche i dati di game e di gioco per farlo partire..

            }else{
                //Se si è ancora in lobby..
                NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
                from: 'system',
                text: `${username} si è riconnesso!`,
                timestamp: Date.now()
            });
            console.log(`[Socket] ${username} REJOIN in ${roomId}`);

            }            

        } else {
            // L'utente è totalmente nuovo per questa stanza
            NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
                from: 'system',
                text: `${username} è entrato nella lobby`,
                timestamp: Date.now()
            });
            console.log(`[Socket] ${username} NEW JOIN in ${roomId}`);
        }

        await broadcastFullState(io, roomId);

    } catch (error) {
        console.error(`[JoinError] ${username}:`, error);
        socket.emit('lobbyError', { message: error.message });
        socket.disconnect(); 
    }
}

async function handleDisconnect(io, socket) {
    const { roomId, username } = socket.data;
    if (!roomId || !username) return;

    try {

        //  Perchè serve questa cosa?
        //Safeguard: se il socket salvato è diverso (e non vuoto) da quello attuale, ignora
        //Fondamentale nel caso in cui la disconnect arrivi dopo la join a seguito di una F5
        const currentStoredSocket = await SocketService.getSocketId(roomId, username);
        if (currentStoredSocket && currentStoredSocket !== socket.id) {
            return; 
        }

        // Rimuove player visibile, setta socket a ""
        const { deletedRoom } = await RoomService.removePlayerFromRoom(roomId, username);

        if (deletedRoom) {
            console.log(`[Socket] Stanza ${roomId} eliminata (vuota).`);
            return; 
        }

        NotificationService.broadcastToRoom(io, roomId, 'chatMessage', {
            from: 'system', 
            text: `${username} ha lasciato la lobby`,
            timestamp: Date.now()
        });

        await broadcastFullState(io, roomId);
        console.log(`[Socket] ${username} offline da ${roomId} (Socket cleared).`);

    } catch (err) {
        console.error(`[DisconnectError] ${username}:`, err);
    }
}

async function handleUserReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;
    try {
        await UserService.setUserReady(username, true);
        const { allReady } = await RoomService.checkAllUsersReady(roomId);
        NotificationService.broadcastToRoom(io, roomId, 'playerReadyChange', { username, isReady: true, allReady });
    } catch (err) { console.error(`[ReadyError]`, err); }
}

async function handleResetReady(io, socket, { roomId }) {
    const { username } = socket.data;
    if (!roomId) return;
    try {
        await UserService.setUserReady(username, false);
        NotificationService.broadcastToRoom(io, roomId, 'playerReadyChange', { username, isReady: false, allReady: false });
    } catch (err) { console.error(`[ResetError]`, err); }
}

async function handleChatMessage(io, socket, { roomId, text }) {
    const { username } = socket.data;
    if (!roomId || !text) return;
    NotificationService.broadcastToRoom(io, roomId, 'chatMessage', { from: username, text, timestamp: Date.now() });
}

function attach(socket, io) {
    socket.on('joinLobby', (payload) => handleJoinLobby(io, socket, payload));
    socket.on('chatMessage', (payload) => handleChatMessage(io, socket, payload));
    socket.on('userReady', (payload) => handleUserReady(io, socket, payload));
    socket.on('resetReady', (payload) => handleResetReady(io, socket, payload));
    socket.on('disconnect', () => handleDisconnect(io, socket));
}

module.exports = { attach };