import React, {useEffect, useState} from 'react';
import { useParams } from 'react-router-dom';
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
    
    // 1. Validation Hook (Fetch iniziale HTTP)
    const { 
        isValidating, 
        lobbyError, 
        setLobbyError,
        roomName, 
        maxPlayers, 
        // adminPlayer e isAdmin iniziali li ignoriamo qui, 
        // ci affideremo ai dati freschi del socket
    } = useLobbyValidation(roomId, user);

    // 2. Stati UI Dati
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);
    const [roomFull, setRoomFull] = useState("In attesa di altri giocatori...");
    
    // 3. Stati Logica Gioco
    const [isReady, setIsReady] = useState(false);
    const [allReady, setAllReady] = useState(false); // Arriva dal socket
    const [readyStates, setReadyStates] = useState({});
    const [gameLoading, setGameLoading] = useState(false);
    
    // 4. Stati Ruoli
    const [adminPlayer, setAdminPlayer] = useState(null); // Nome dell'host
    const [isAdmin, setIsAdmin] = useState(false); // Booleano derivato
    const [canStartGame, setCanStartGame] = useState(false); // Booleano derivato

    // --- LOGICA DERIVATA (Sostituisce la logica "sporca" dentro i socket) ---
    
    // A. Calcolo se sono Admin
    useEffect(() => {
        if (user && adminPlayer) {
            setIsAdmin(user.username === adminPlayer);
        }
    }, [user, adminPlayer]);

    // B. Calcolo se posso startare (Host + Tutti Pronti)
    useEffect(() => {
        if (isAdmin && allReady) {
            setCanStartGame(true);
        } else {
            setCanStartGame(false);
        }
    }, [isAdmin, allReady]);

    // C. Testo stanza piena
    useEffect(() => {
        if (players.length > 0 && maxPlayers && players.length >= maxPlayers) {
            setRoomFull("Stanza piena!");
        } else {
            setRoomFull("In attesa di altri giocatori...");
        }
    }, [players, maxPlayers]);


    // 5. Socket Hook
    useLobbySocket(
        socket, 
        connectSocket, 
        roomId, 
        user, 
        setPlayers, 
        setReadyStates, 
        setAllReady, 
        setAdminPlayer, 
        setIsReady, 
        setMessages, 
        setGameLoading, 
        setLobbyError, 
        isValidating, 
        lobbyError
    );

    // 6. Handlers Hook
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
   
    // --- RENDER ---

    if (gameLoading) return <Game />; 
    if (isValidating) return <div className="lobby-page mini-form-page"><div className="lobby-card"><h1>Verifica...</h1></div></div>;
    if (lobbyError) return <div className="lobby-page"><div className="lobby-card"><h1 style={{color:'red'}}>Errore</h1><p>{lobbyError}</p></div></div>;
    if (!user) return <MiniForm roomId={roomId} onUserCreated={setUser} />;

    return (
        <div className="lobby-page">
            <div className="lobby-layout">
                {/* COLONNA SINISTRA: CHAT */}
                <div className="lobby-chat-column">
                    <div className="chat-container">
                        <h2 className="chat-title">Chat lobby</h2>
                        <div className="chat-messages">
                            {messages.length === 0 && <p className="chat-empty">Nessun messaggio.</p>}
                            {messages.map((m, idx) => (
                                <div key={idx} className={`chat-message ${m.from === 'system' ? 'chat-message-system' : ''}`}>
                                    <span className="chat-from">{m.from === 'system' ? '[SYSTEM]' : m.from}:</span>
                                    <span className="chat-text">{m.text}</span>
                                </div>
                            ))}
                        </div>
                        <form className="chat-input-form" onSubmit={handleSubmitChat}>
                            <input
                                type="text"
                                className="chat-input"
                                placeholder="Scrivi..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button type="submit" className="chat-send-btn">Invia</button>
                        </form>
                    </div>
                </div>

                {/* COLONNA CENTRALE */}
                <div className="lobby-card">
                    <h1 className="lobby-title">Lobby partita</h1>
                    <div className="lobby-info">
                        <p className="lobby-label">Stanza: {roomName}</p>
                        <p className="lobby-room-code">{roomId}</p>
                    </div>
                    <p className="lobby-subtitle">{roomFull}</p>
                    
                    <div>
                        Ruolo: <span className={isAdmin ? 'lobby-role-admin' : 'lobby-role-player'}>
                            {isAdmin ? 'Admin' : 'Player'}
                        </span>
                    </div>
                    
                    <div className="lobby-buttons">
                        {isAdmin ? (
                            <button 
                                className="lobby-main-btn admin-btn" 
                                onClick={() => handleStartGame(canStartGame)}
                                disabled={!canStartGame}
                                style={{ opacity: canStartGame ? 1 : 0.5, cursor: canStartGame ? 'pointer' : 'not-allowed' }}
                            >
                                {canStartGame ? '✅ Inizia Partita' : '⏳ Attesa Giocatori'}
                            </button>
                        ) : (
                            <button 
                                className={`lobby-main-btn player-btn ${isReady ? 'ready' : ''}`}
                                onClick={handleReady}
                            >
                                {isReady ? '✅ Pronto' : 'Pronto'}
                            </button>
                        )}
                        <button className="lobby-main-btn" onClick={handleBackHome}>Esci</button>
                    </div>
                </div>

                {/* COLONNA DESTRA: PLAYERS */}
                <aside className="lobby-sidebar">
                    <h2 className="sidebar-title">Giocatori ({players.length}/{maxPlayers})</h2>
                    <div className="sidebar-players">
                        {players.map((p, idx) => (
                            <div key={idx} className={`sidebar-player ${p === user.username ? 'sidebar-player-me' : ''}`}>
                                <span className="sidebar-player-avatar">{p?.[0]?.toUpperCase()}</span>
                                <span className="sidebar-player-name">
                                    {p} {p === user.username && '(tu)'} {p === adminPlayer && '👑'}
                                    {/* Mostra spunta verde se pronto (host escluso visualmente o incluso) */}
                                    {readyStates[p] && p !== adminPlayer && <span className="ready-check"> ✅</span>}    
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