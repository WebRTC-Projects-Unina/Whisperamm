import { useNavigate } from 'react-router-dom';

export const useLobbyHandlers = (socket, roomId, disconnectSocket, isReady, setIsReady, newMessage, setNewMessage, user) => {
    const navigate = useNavigate();

    const handleReady = () => {
        if (!socket) return;
        
        // Optimistic Update: Aggiorno subito la UI prima che il server risponda.
        // Rende il click immediato. Se il server fallisce, il socket event resetterà lo stato corretto.
        setIsReady(!isReady); 

        if (isReady) {
            socket.emit('resetReady', { roomId });
        } else {
            socket.emit('userReady', { roomId });
        }
    };

    const handleStartGame = (canStartGame) => {
        if (!canStartGame || !socket) return;
        console.log("Admin preme Start...");
        socket.emit('gameStarted', { roomId });
    };

    // FIX CHAT: Rimosso 'setNewMessage' dai parametri della funzione
    const handleSubmitChat = (e) => {
        e.preventDefault();
        
        // Controllo validità
        if (!newMessage.trim() || !socket || !user) return;

        socket.emit('chatMessage', {
            roomId,
            from: user.username,
            text: newMessage.trim(),
        });

        // Usa la funzione setNewMessage passata negli argomenti del hook (riga 3)
        setNewMessage('');
    };

    const handleBackHome = () => {
        if (socket) {
            disconnectSocket();
        }
        navigate('/');  
    }
    
    return { handleReady, handleStartGame, handleSubmitChat, handleBackHome };
};