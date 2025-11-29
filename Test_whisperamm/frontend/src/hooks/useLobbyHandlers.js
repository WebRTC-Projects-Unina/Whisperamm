import { useNavigate } from 'react-router-dom';

export const useLobbyHandlers = (socket, roomId, disconnectSocket, isReady, setIsReady, newMessage, setNewMessage, user) => {
    const navigate = useNavigate();

    const handleReady = () => {
        if (!socket) return;
        
        if (isReady) {
            socket.emit('resetReady', { roomId });
            setIsReady(false);
        } else {
            socket.emit('userReady', { roomId });
            setIsReady(true);
        }
    };

    const handleStartGame = (canStartGame) => {
        if (!canStartGame || !socket) return;
        console.log("Admin preme Start...");
        socket.emit('gameStarted', { roomId });
    };

    const handleSubmitChat = (e, setNewMessage) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket || !user) return;
        socket.emit('chatMessage', {
            roomId,
            from: user.username,
            text: newMessage.trim(),
        });
        setNewMessage('');
    };

    const handleBackHome = () => {
        if (socket) {
            disconnectSocket();
        }
        navigate('/');  
    };

    return { handleReady, handleStartGame, handleSubmitChat, handleBackHome };
};