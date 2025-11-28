import React, {useEffect, useState} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import '../style/Lobby.css';
import Game from './Game';

const Lobby = () => {
    
    const { user, setUser } = useAuth();
    
    //1. RECUPERIAMO 'connectSocket' DAL PROVIDER
    const { socket, connectSocket, disconnectSocket } = useSocket();

    const [isValidating, setIsValidating] = useState(!!user);
    const { roomId } = useParams();
    const navigate = useNavigate();

    // Stati UI
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);
    const [roomName, setRoomName] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(null);
    const [roomFull, setRoomFull] = useState("In attesa di altri giocatori...");
    
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminPlayer, setAdminPlayer] = useState(null);
    const [lobbyError, setLobbyError] = useState(null);
   
    const [isReady, setIsReady] = useState(false);
    const [canStartGame, setCanStartGame] = useState(false);
    const [allReady, setAllReady] = useState(false);
    const [readyStates, setReadyStates] = useState({});
    const [gameLoading, setGameLoading] = useState(false);


    // --- 1. VALIDAZIONE HTTP (Controllo esistenza stanza) ---
    useEffect(() => {
        let ignore = false;

        if (!roomId) {
            setLobbyError("ID partita non trovato.");
            setIsValidating(false);
            return;
        }

        if (!user) {
            setIsValidating(false);
            setLobbyError(null);
            return;
        }

        const checkLobby = async () => {
            setIsValidating(true);  
            setLobbyError(null);

            try {
                const response = await fetch(`/api/game/checkRoom/${roomId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user })
                });

                const data = await response.json();
                if (ignore) return;

                if (!response.ok) {
                    if (response.status === 404) setLobbyError(data.message || "Stanza non trovata.");
                    else if (response.status === 403) setLobbyError(data.message || "La stanza è piena.");
                    else setLobbyError(data.message || "Errore sconosciuto.");
                } else {
                    setLobbyError(null);
                    setRoomName(data.roomName || '');
                    setMaxPlayers(data.maxPlayers || null);
                    setAdminPlayer(data.host);
                    if(user.username === data.host) setIsAdmin(true);
                }

            } catch (err) {
                if (!ignore) {
                    console.error("Errore fetch:", err);
                    setLobbyError("Impossibile connettersi al server.");
                }
            } finally {
                if (!ignore) setIsValidating(false);
            }
        };

        checkLobby();
        return () => {ignore = true;};

    }, [user, roomId]);


    // --- 2. GESTIONE REDIRECT ERRORE ---
    useEffect(() => {
        if (lobbyError) {
            const timer = setTimeout(() => navigate('/'), 2000); 
            return () => clearTimeout(timer);
        }
    }, [lobbyError, navigate]);


    // --- 3. LOGICA SOCKET (PULITA E GLOBALE) ---
    useEffect(() => {
        // Blocchi di sicurezza
        if(isValidating || lobbyError || !user) return;

        // A. SE IL SOCKET GLOBALE NON ESISTE, LO CHIEDIAMO
        if (!socket) {
            console.log("🔌 Lobby: Socket nullo, richiedo connessione al Provider...");
            connectSocket(); 
            // Usciamo dalla funzione. Quando il provider aggiornerà lo stato 'socket',
            // questo useEffect verrà rieseguito automaticamente.
            return; 
        }

        // --- DA QUI IN POI, 'socket' ESISTE SICURAMENTE ---

        // B. DEFINIZIONE HANDLERS
        const handleLobbyPlayers = (payload) => {
            setPlayers(payload.players || []);
            setReadyStates(payload.readyStates || {});
        };

        const handleUserReadyUpdate = (payload) => {
            setReadyStates(payload.readyStates);
            // Aggiorna isReady in base allo stato attuale
            if (payload.username === user.username) {
                setIsReady(payload.readyStates[user.username] || false);
            }
        };

        const handleGameCanStart = () => {
            setAllReady(true);
            if (isAdmin) setCanStartGame(true);
        };

        const handleAllUsersReady = (payload) => {
            console.log("🔔 allUsersReady ricevuto:", payload.allReady, "isAdmin:", isAdmin); // DEBUG

            setAllReady(payload.allReady);
            if (isAdmin) setCanStartGame(payload.allReady);
        };

        const handleChatMessage = (msg) => setMessages((prev) => [...prev, msg]);
        
        const handleLobbySocketError = (error) => {
            setLobbyError(error.message || "Errore socket");
        };
        
        const handleHostChanged = (payload) => {
            setAdminPlayer(payload.newHost);
            setIsAdmin(user.username === payload.newHost);
        };

        // PUNTO CRUCIALE: AVVIO GIOCO
        const handleGameStarted = (payload) => {
            console.log("🚀 Partita iniziata! Navigazione verso Game...");
            setGameLoading(true);
            // Navighiamo e la socket resta viva nel Provider!            
        };    

        // C. JOIN E ATTACH LISTENERS
        console.log("Socket pronta, invio joinLobby...");
        
        // Emettiamo subito il join
        socket.emit('joinLobby', { roomId, user });

        // Attacchiamo i listener
        socket.on('lobbyError', handleLobbySocketError); 
        socket.on('lobbyPlayers', handleLobbyPlayers); 
        socket.on('chatMessage', handleChatMessage); 
        socket.on('hostChanged', handleHostChanged); 
        socket.on('userReadyUpdate', handleUserReadyUpdate); 
        socket.on('gameCanStart', handleGameCanStart); 
        socket.on('allUsersReady', handleAllUsersReady); 
        socket.on('gameStarted', handleGameStarted); 

        // D. CLEANUP: RIMUOVIAMO I LISTENER MA NON CHIUDIAMO LA CONNESSIONE
        return () => {
            if (socket) {
                console.log("🧹 Lobby smontata: Rimozione listener (Socket resta viva)");
                socket.off('lobbyError', handleLobbySocketError);
                socket.off('lobbyPlayers', handleLobbyPlayers);
                socket.off('chatMessage', handleChatMessage);
                socket.off('hostChanged', handleHostChanged);
                socket.off('userReadyUpdate', handleUserReadyUpdate);
                socket.off('gameCanStart', handleGameCanStart);
                socket.off('allUsersReady', handleAllUsersReady);
                socket.off('gameStarted', handleGameStarted);
                
                // Niente disconnect() qui!
            }
        };
        
    }, [roomId, user, lobbyError, isValidating, socket, connectSocket, isAdmin]); // 'socket' è la dipendenza chiave


    // --- 4. HANDLERS UTENTE ---

    const handleReady = () => {
        if (!socket) return;
        
        if (isReady) {
            // Se è già pronto, reset
            socket.emit('resetReady', { roomId });
            setIsReady(false);
        } else {
            // Se non è pronto, diventa pronto
            socket.emit('userReady', { roomId });
            setIsReady(true);
        }
    };

    const handleStartGame = () => {
        if (!canStartGame || !socket) return;
        console.log("Admin preme Start...");
        socket.emit('gameStarted', { roomId });
    };

    const handleSubmitChat = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket || !user) return;
        socket.emit('chatMessage', {
            roomId,
            from: user.username,
            text: newMessage.trim(),
        });
        setNewMessage('');
    };

    const handleJoinRegister = async (e) => {
        e.preventDefault();
        setError(null);
        if (usernameInput.length < 3) {
            setError('Nome troppo corto.');
            return;
        }
        try {
            const response = await fetch('/api/register', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput }),
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Errore');
            
            // Aggiornando l'user, il useEffect sopra scatterà
            setUser(data.user);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleBackHome = () => {
        // Qui l'utente vuole uscire davvero, quindi chiudiamo tutto.
        if (socket) {
            console.log("Utente esce dalla lobby, disconnessione socket...");
            socket.emit('leaveLobby', { roomId });
        }
        setTimeout(() => {
            disconnectSocket();
        }, 200);        
        navigate('/');
    };


    // --- 5. RENDER ---

    useEffect(() => {
        if (players.length > 0 && maxPlayers && players.length >= maxPlayers) {
            setRoomFull("Stanza piena!");
        } else {
            setRoomFull("In attesa di altri giocatori...");
        }
    }, [players]);

    if (gameLoading) return <Game />; 

    if (isValidating) return <div className="lobby-page mini-form-page"><div className="lobby-card"><h1>Verifica...</h1></div></div>;

    if (lobbyError) return <div className="lobby-page"><div className="lobby-card"><h1 style={{color:'red'}}>Errore</h1><p>{lobbyError}</p></div></div>;

    if (!user) {
        return (
        <div className="lobby-page mini-form-page">
            <div className="lobby-card">
                <h1 className="lobby-title">Unisciti</h1>
                <p className="lobby-room-code">{roomId}</p>
                <form className="chat-input-form" onSubmit={handleJoinRegister}>
                    <input type="text" className="chat-input" placeholder="Nome..." value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} autoFocus />
                    <button type="submit" className="chat-send-btn">Entra</button>
                </form>
                {error && <p style={{ color: 'red'}}>{error}</p>}
            </div>
        </div>
        );
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
                                disabled={!canStartGame}  // ✅ AGGIUNTO il controllo
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
                        <button className="lobby-main-btn" onClick={handleBackHome}>
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
                                    {/* ✅ NUOVO: Mostra il check se l'utente è pronto (NON per admin) */}
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