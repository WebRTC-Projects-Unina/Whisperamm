// src/pages/Lobby.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthProvider'; // <-- IMPORTA
import './Lobby.css';

function Lobby() {
    // --- STATI PRINCIPALI ---
    const { gameId } = useParams();
    const navigate = useNavigate();
    const { user, setUser } = useAuth(); // Prende l'utente e la funzione per impostarlo

    // --- STATI DELLA LOBBY ---
    const [socket, setSocket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);

    // --- STATI PER IL MINI-FORM ---
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(null); // Errore per il mini-form

    // --- STATI DI VALIDAZIONE LOBBY ---
    const [isValidating, setIsValidating] = useState(true); // Stiamo controllando...
    const [lobbyError, setLobbyError] = useState(null); // Errore fatale della lobby

    // --- CONTROLLO VALIDITÀ LOBBY ---
    // Si attiva una sola volta al montaggio per controllare se la stanza esiste
    useEffect(() => {
        const checkLobby = async () => {
            try {
                // Assicurati che questo endpoint esista sul tuo server
                const response = await fetch(`/api/game/checkGame/${gameID}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: user }) // <-- 'user' è disponibile
                });

                if (!res.ok) {
                    if (res.status === 404) {
                        throw new Error('Stanza non trovata.');
                    }
                    throw new Error('Errore nel verificare la stanza.');
                }

                // Tutto OK, possiamo smettere di validare
                setIsValidating(false);

            } catch (err) {
                console.error(err.message);
                setLobbyError(err.message); // Imposta l'errore fatale
                setIsValidating(false); // Finito, anche se con errore
            }
        };

        checkLobby();
    }, [gameId]); // Dipende solo da gameId

    // --- 2. GESTORE REDIRECT SU ERRORE ---
    // Si attiva se 'lobbyError' cambia da null a un messaggio
    useEffect(() => {
        if (lobbyError) {
            // Mostra l'errore per 3 secondi, poi reindirizza
            const timer = setTimeout(() => {
                navigate('/'); // Reindirizza alla Home
            }, 3000); // 3 secondi

            // Pulisce il timer se il componente viene smontato
            return () => clearTimeout(timer);
        }
    }, [lobbyError, navigate]); // Dipende da lobbyError e navigate

    // --- 3. LOGICA SOCKET (Si attiva solo se l'utente e la stanza sono validi) ---
    useEffect(() => {
        // GUARDIA: Non connetterti se:
        // 1. Non c'è un utente
        // 2. Stiamo ancora validando la stanza
        // 3. C'è stato un errore fatale con la stanza
        if (!user || isValidating || lobbyError) {
            return;
        }

        // Se siamo qui, l'utente è loggato e la stanza è valida. Connettiamo.
        const newSocket = io('http://localhost:8080', {
            withCredentials: false,
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket connesso, id:', newSocket.id);
        });

        // Entra nella stanza usando l'utente dal context
        newSocket.emit('joinLobby', { gameId, user: user });

        // Gestori per i messaggi dal server
        const handleChatMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };
        const handleLobbyPlayers = (payload) => {
            if (payload?.gameId !== gameId) return;
            setPlayers(payload.players || []);
        };

        newSocket.on('chatMessage', handleChatMessage);
        newSocket.on('lobbyPlayers', handleLobbyPlayers);

        // Funzione di pulizia
        return () => {
            newSocket.off('chatMessage', handleChatMessage);
            newSocket.off('lobbyPlayers', handleLobbyPlayers);
            newSocket.disconnect();
            setSocket(null); // Pulisci lo stato dello socket
        };
    }, [gameId, user, isValidating, lobbyError]); // Dipende da tutte queste condizioni

    // --- 4. GESTORI DI EVENTI ---

    // Gestore per l'invio di messaggi in chat
    const handleSubmitChat = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket || !user) return;

        socket.emit('chatMessage', {
            gameId,
            from: user.username, // Usa l'utente del context
            text: newMessage.trim(),
        });

        setNewMessage('');
    };

    // Gestore per il "mini-form" di registrazione/join
    const handleJoinRegister = async (e) => {
        e.preventDefault();
        setError(null);
        if (usernameInput.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }
        try {
            // Usa lo stesso endpoint della pagina di Registrazione
            const response = await fetch('/api/register', { // Assumendo path relativo
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Nome già in uso');
            }

            // LA MAGIA: Salviamo l'utente nel context.
            // Questo fa ri-renderizzare il componente.
            // L'useEffect (n.3) vedrà il nuovo 'user' e connetterà lo socket.
            setUser(data.user);
        } catch (err) {
            setError(err.message);
        }
    };

    // Gestore per tornare alla Home
    const handleBackHome = () => {
        navigate('/');
    };

    // --- 5. RENDER CONDIZIONALE ---

    // CASO 0: Validazione in corso
    if (isValidating) {
        return (
            <div className="lobby-page">
                <div className="lobby-card">
                    <h1 className="lobby-title">Verifica stanza...</h1>
                </div>
            </div>
        );
    }

    // CASO 1: Errore fatale (stanza non trovata)
    if (lobbyError) {
        return (
            <div className="lobby-page">
                <div className="lobby-card">
                    <h1 className="lobby-title" style={{ color: 'red' }}>Errore</h1>
                    <p className="lobby-subtitle">{lobbyError}</p>
                    <p>Stai per essere reindirizzato alla Home...</p>
                </div>
            </div>
        );
    }

    // CASO 2: Stanza valida, ma utente NON loggato (mostra il mini-form)
    if (!user) {
        return (
            <div className="lobby-page">
                <div className="lobby-layout">
                    <div className="lobby-card">
                        <h1 className="lobby-title">Unisciti alla partita</h1>
                        <div className="lobby-info">
                            <p className="lobby-label">Codice stanza</p>
                            <p className="lobby-room-code">{gameId}</p>
                        </div>
                        <p className="lobby-subtitle">
                            Inserisci un nome per entrare e giocare.
                        </p>

                        {/* Form di registrazione sul posto */}
                        <form className="chat-input-form" onSubmit={handleJoinRegister}>
                            <input
                                type="text"
                                className="chat-input"
                                placeholder="Scrivi il tuo nome..."
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                autoFocus
                            />
                            <button type="submit" className="chat-send-btn">
                                Entra
                            </button>
                        </form>
                        {error && <p className="error-message" style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
                    </div>
                    {/* Non mostriamo la sidebar dei player se non è loggato */}
                </div>
            </div>
        );
    }

    // CASO 3: Stanza valida E utente loggato (mostra la lobby completa)
    return (
        <div className="lobby-page">
            <div className="lobby-layout">
                <div className="lobby-card">
                    <h1 className="lobby-title">Lobby partita</h1>

                    <div className="lobby-info">
                        <p className="lobby-label">Codice stanza</p>
                        <p className="lobby-room-code">{gameId}</p>
                    </div>

                    <p className="lobby-subtitle">
                        In attesa di altri giocatori... Nel frattempo puoi usare la chat.
                    </p>

                    {/* SEZIONE CHAT */}
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

                        {/* Form della chat */}
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

                    <button className="lobby-back-btn" onClick={handleBackHome}>
                        Torna alla Home
                    </button>
                </div>

                {/* Sidebar dei giocatori */}
                <aside className="lobby-sidebar">
                    <h2 className="sidebar-title">Giocatori nella stanza</h2>
                    <p className="sidebar-room-code">{gameId}</p>

                    <div className="sidebar-players">
                        {players.length === 0 && (
                            <p className="sidebar-empty">In attesa di giocatori...</p>
                        )}

                        {players.map((p, idx) => (
                            <div
                                key={idx}
                                className={
                                    p === user.username // Usa 'user.username' dal context
                                        ? 'sidebar-player sidebar-player-me'
                                        : 'sidebar-player'
                                }
                            >
                                <span className="sidebar-player-avatar">
                                    {p?.[0]?.toUpperCase() || '?'}
                                </span>
                                <span className="sidebar-player-name">
                                    {p}
                                    {p === user.username && ' (tu)'} {/* Usa 'user.username' */}
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