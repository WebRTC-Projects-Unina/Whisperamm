import React, {useEffect, useState} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import { useLobbyValidation } from '../hooks/useLobbyValidation';
import { useLobbySocket } from '../hooks/useLobbySocket';
import { useLobbyHandlers } from '../hooks/useLobbyHandlers';
import '../style/Lobby.css';
import MiniForm from './MiniForm';
import Game from './Game';

const Lobby = () => {
    
    const { user, setUser } = useAuth();
    const { socket, connectSocket, disconnectSocket } = useSocket();
    const { roomId } = useParams();
    
    //hook
    const { 
        isValidating, 
        setIsValidating,
        lobbyError, 
        setLobbyError,
        roomName, 
        setRoomName,
        maxPlayers, 
        setMaxPlayers,
        adminPlayer, 
        setAdminPlayer,
        isAdmin, 
        setIsAdmin 
    } = useLobbyValidation(roomId, user);

    // Stati UI
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(null);
    const [roomFull, setRoomFull] = useState("In attesa di altri giocatori...");
    
    const [isReady, setIsReady] = useState(false);
    const [canStartGame, setCanStartGame] = useState(false);
    const [allReady, setAllReady] = useState(false);
    const [readyStates, setReadyStates] = useState({});
    const [gameLoading, setGameLoading] = useState(false);

    const navigate = useNavigate();

    //hook
    useLobbySocket(
        socket, 
        connectSocket, 
        roomId, 
        user, 
        isAdmin,
        setIsAdmin, 
        setPlayers, 
        setReadyStates, 
        setIsReady, 
        setAllReady, 
        setCanStartGame, 
        setLobbyError, 
        setAdminPlayer, 
        setMessages, 
        setGameLoading, 
        isValidating, 
        lobbyError,
        allReady
    );

const { handleReady, handleStartGame, handleSubmitChat, handleBackHome} = useLobbyHandlers(
    socket, 
    roomId, 
    disconnectSocket, 
    isReady, 
    setIsReady, 
    newMessage, 
    setNewMessage, 
    user
);
   
    // --- 5. RENDER LOGIC ---

    useEffect(() => {
        if (players.length > 0 && maxPlayers && players.length >= maxPlayers) {
            setRoomFull("Stanza piena!");
        } else {
            setRoomFull("In attesa di altri giocatori...");
        }
    }, [players, maxPlayers]);

    useEffect(() => {
        // Quando cambia isAdmin, resetta isReady se diventa admin
        if (isAdmin && isReady) {
            setIsReady(false);
        }
    }, [isAdmin]);


    if (gameLoading) return <Game />; 

    if (isValidating) return <div className="lobby-page mini-form-page"><div className="lobby-card"><h1>Verifica...</h1></div></div>;

    if (lobbyError) return <div className="lobby-page"><div className="lobby-card"><h1 style={{color:'red'}}>Errore</h1><p>{lobbyError}</p></div></div>;

    if (!user) {
        return <MiniForm roomId={roomId} onUserCreated={setUser} error={error} />;
    }

    return (
        <div className="lobby-page">
            <div className="lobby-layout">
                {/* COLONNA SINISTRA: CHAT */}
                <div className="lobby-chat-column">
                    <div className="chat-container">
                        <h2 className="chat-title">Chat lobby</h2>
                        
                        <div className="chat-messages">
                            {messages.length === 0 && (
                                <p className="chat-empty">Nessun messaggio. Scrivi qualcosa!</p>
                            )}

                            {messages.map((m, idx) => (
                                <div
                                    key={idx}
                                    className={
                                        m.from === 'system'
                                            ? 'chat-message chat-message-system'
                                            : 'chat-message'
                                    }
                                >
                                    <span className="chat-from">
                                        {m.from === 'system' ? '[SYSTEM]' : m.from}:
                                    </span>
                                    <span className="chat-text">{m.text}</span>
                                </div>
                            ))}
                        </div>

                        <form className="chat-input-form" onSubmit={handleSubmitChat}>
                            <input
                                type="text"
                                className="chat-input"
                                placeholder="Scrivi un messaggio..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button type="submit" className="chat-send-btn">
                                Invia
                            </button>
                        </form>
                    </div>
                </div>

                {/* COLONNA CENTRALE: INFO + BOTTONI */}
                <div className="lobby-card">
                    <h1 className="lobby-title">Lobby partita</h1>

                    <div className="lobby-info">
                        <p className="lobby-label">Nome stanza</p>
                        <p className="lobby-room-name">{roomName || 'Sconosciuto'}</p>
                        <p className="lobby-label">Codice stanza</p>
                        <p className="lobby-room-code">{roomId}</p>
                    </div>

                    <p className="lobby-subtitle">
                        {roomFull}
                    </p>

                    <div>
                        <p>
                            In questa stanza sei {''}
                            <span className={isAdmin ? 'lobby-role-admin' : 'lobby-role-player'}>
                                {isAdmin ? 'Admin' : 'Player'}
                            </span>
                        </p>
                    </div>
                    
                    <div className="lobby-buttons">
                        {isAdmin ? (
                            <button 
                                className="lobby-main-btn admin-btn" 
                                onClick={handleStartGame}
                                disabled={!canStartGame}
                            >
                                {canStartGame ? '✅ Inizia Partita' : '⏳ In Attesa'}
                            </button>
                        ) : (
                            <button 
                                className={`lobby-main-btn player-btn ${isReady ? 'ready' : ''}`}
                                onClick={handleReady}
                            >
                                {isReady ? '✅ Pronto' : 'Pronto'}
                            </button>
                        )}
                        <button className="lobby-main-btn" onClick={(handleBackHome)} >
                            Torna alla Home
                        </button>
                    </div>
                </div>

                {/* COLONNA DESTRA: LISTA GIOCATORI */}
                <aside className="lobby-sidebar">
                    <h2 className="sidebar-title">Giocatori nella stanza</h2>
                    <p className="sidebar-room-code">{players.length + ' / ' + maxPlayers}</p>

                    <div className="sidebar-players">
                        {players.length === 0 && (
                            <p className="sidebar-empty">In attesa di giocatori...</p>
                        )}

                        {players.map((p, idx) => (
                            <div
                                key={idx}
                                className={
                                    p === user.username
                                        ? 'sidebar-player sidebar-player-me'
                                        : 'sidebar-player'
                                }
                            >
                                <span className="sidebar-player-avatar">
                                    {p?.[0]?.toUpperCase() || '?'}
                                </span>
                                <span className={
                                    p === adminPlayer
                                        ? 'sidebar-player-name sidebar-player-admin'
                                        : 'sidebar-player-name'
                                }>
                                    {p}
                                    {p === user.username && ' (tu)'}
                                    {p === adminPlayer && '👑'}
                                    {readyStates[p] && p !== adminPlayer && <span className="ready-check">✅</span>}    
                                </span>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>
        </div>
    );
}

export default Lobby;