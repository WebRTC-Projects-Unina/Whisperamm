// src/pages/Lobby.jsx
import React, {useEffect, useRef, useState} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthProvider'; // <-- IMPORTA
import './Lobby.css';

function Lobby() {
    const { gameId } = useParams();
    const navigate = useNavigate();
    const { user, setUser } = useAuth();
    
    // Stati
    const socketRef = useRef(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);
    const [roomName, setRoomName] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(null);
    const [roomFull, setRoomFull] = useState("In attesa di altri giocatori...");
    const [isAdmin, setIsAdmin] = useState(false); // ✅ AGGIUNGI QUESTA RIGA

    // Inizializza isValidating basandoti sulla presenza dell'utente
    const [isValidating, setIsValidating] = useState(!!user);
    const [lobbyError, setLobbyError] = useState(null);

    useEffect(() => {
        // Flag per evitare race conditions se il componente si smonta o gameId cambia
        let ignore = false;

        // 1. Reset preventivo
        if (!gameId) {
            setLobbyError("ID partita non trovato.");
            setIsValidating(false);
            return;
        }
        console.log(user)
        if (!user) {
            setIsValidating(false);
            setLobbyError(null);
            return;
        }

        // 2. Avviamo validazione
        const checkLobby = async () => {
            // IMPORTANTE: Diciamo a tutti "Sto lavorando, fermi!"
            setIsValidating(true);
            setLobbyError(null);

            try {
                const response = await fetch(`/api/game/checkGame/${gameId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user })
                });

                const data = await response.json();

                // Se nel frattempo il componente è stato smontato (ignore=true), fermati.
                if (ignore) return;

                if (!response.ok) {
                    // Gestione errori...
                    if (response.status === 404) {
                        setLobbyError(data.message || "Stanza non trovata.");
                    } else if (response.status === 403) {
                        setLobbyError(data.message || "La stanza è piena.");
                    } else {
                        setLobbyError(data.message || "Errore sconosciuto.");
                    }
                } else {
                    console.log("Validazione lobby OK");
                    // Se tutto ok, l'errore deve essere null
                    setLobbyError(null);
                    setRoomName(data.roomName || '');
                    setMaxPlayers(data.maxPlayers || null);
                    // ✅ AGGIUNGI QUESTE RIGHE
                    if (data.isAdmin !== undefined) {
                        setIsAdmin(data.isAdmin);
                        console.log("Utente è admin?", data.isAdmin);
                    }
                }

            } catch (err) {
                if (!ignore) {
                    console.error("Errore fetch:", err);
                    setLobbyError("Impossibile connettersi al server.");
                }
            } finally {
                // Sblocchiamo il semaforo SOLO se siamo ancora "validi"
                if (!ignore) {
                    setIsValidating(false);
                }
            }
        };

        checkLobby();

        // Se gameId cambia mentre stavo facendo la fetch,
        // ignora il risultato della fetch vecchia.
        return () => {
            ignore = true;
        };

    }, [user, gameId]); // Rimuovi setLobbyError ecc dalle dipendenze, non servono

    // --- GESTORE REDIRECT SU ERRORE ---
    // Si attiva se 'lobbyError' cambia da null a un messaggio
    useEffect(() => {
        if (lobbyError) {
            // Mostra l'errore per 3 secondi, poi reindirizza
            const timer = setTimeout(() => {
                navigate('/'); // Reindirizza alla Home
            }, 2000); // 2 secondi

            // Pulisce il timer se il componente viene smontato
            return () => clearTimeout(timer);
        }
    }, [lobbyError, navigate]); // Dipende da lobbyError e navigate

    // --- 3. LOGICA SOCKET (Si attiva solo se l'utente e la stanza sono validi) ---

    useEffect(() => {

        // Uso isValidating come semaforo -> Attendo la validazione
        if(isValidating) {
            console.log("Socket in attesa di validazione...");
            return;
        }

        if(lobbyError) {
            console.log("Blocco connessione per via di un errore: ", lobbyError);
            return;
        }

        // Non connetterti se:
        // 1. Non c'è un utente
        // 2. C'è stato un errore fatale con la stanza
        if (!user || lobbyError) {
            return;
        }

        console.log("Validazione passata, connessione Socket in corso...");

        const socket = io('http://localhost:8080', {
            withCredentials: true,
        });

        socketRef.current = socket;

        // Gestori
        const handleChatMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };
        const handleLobbyPlayers = (payload) => {
            if (payload?.gameId !== gameId) return;
            setPlayers(payload.players || []);
        };

        const handleLobbyError = (error) => {
            // Errore ricevuto dalla socket
            console.error("Errore dalla lobby via socket:", error.message);
            setLobbyError(error.message || "Errore dalla stanza");
            socketRef.current.disconnect();
        };

        //Attacco i listener
        socket.on('chatMessage', handleChatMessage);
        socket.on('lobbyPlayers', handleLobbyPlayers);
        socket.on('lobbyError', handleLobbyError);
        socket.on('adminChanged', handleAdminChanged);


        // Gestisci l'evento 'connect'
        socket.on('connect', () => {
            console.log('Socket connesso, id:', socket.id);
            socket.emit('joinLobby', { gameId, user});
        });

        // Funzione di cleanup
        return () => {
            socket.off('chatMessage', handleChatMessage);
            socket.off('lobbyPlayers', handleLobbyPlayers);
            socket.off('lobbyError', handleLobbyError);
            socket.off('adminChanged', handleAdminChanged);
            socket.disconnect()
            console.log('Socket disconnesso');
            socketRef.current = null; // Pulisci lo stato dello socket
        };
    }, [gameId, user, lobbyError, isValidating]); // Dipende da tutte queste condizioni

    // --- 4. GESTORI DI EVENTI ---

    // Gestore per l'invio di messaggi in chat
    const handleSubmitChat = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !socketRef || !user) return;

        socketRef.current.emit('chatMessage', {
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
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Nome già in uso');
            }

            // LA MAGIA: Salviamo l'utente nel context.
            // Questo fa ri-renderizzare il componente.
            // L'useEffect (n.3) vedrà il nuovo 'user' e connetterà lo socket.
            setUser(data.user);
            console.log("User aggiornato")
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAdminChanged = (payload) => {
        console.log("Admin cambiato:", payload);

        // Se l'utente corrente è il nuovo admin
        if (payload.newAdmin.username === user.username) {
            setIsAdmin(true);
            console.log("Sei diventato admin!");
        } else {
            // Se eri admin e non sei più il nuovo admin, rimani player
            setIsAdmin(false);
        }

        // Opzionale: mostra un messaggio di sistema
        setMessages(prev => [...prev, {
            from: 'system',
            text: payload.message
        }]);
    };

    // Gestore per tornare alla Home
    const handleBackHome = () => {
        navigate('/');
    };

    useEffect(() => {
        if (players.length > 0 && maxPlayers && players.length >= maxPlayers) {
            setRoomFull("Stanza piena, preparati a giocare!");
        }else {
            setRoomFull("In attesa di altri giocatori...");
        }
    }, [players]);


    // --- RENDER CONDIZIONALE ---

    if (isValidating) {
        return (
            <div className="lobby-page mini-form-page">
                <div className="lobby-card">
                    <h1 className="lobby-subtitle">Verifica stanza...</h1>
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
        <div className="lobby-page mini-form-page">
            <div className="lobby-card">
                <h1 className="lobby-title">Unisciti alla partita</h1>

                <div className="lobby-info">
                    <p className="lobby-label">Codice stanza</p>
                    <p className="lobby-room-code">{gameId}</p>
                </div>

                <p className="lobby-subtitle">
                    Inserisci un nome per entrare e giocare.
                </p>

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

                {error && (
                    <p className="error-message" style={{ color: 'red', marginTop: '10px' }}>
                        {error}
                    </p>
                )}
            </div>
        </div>
        );
    }

    // CASO 3: Stanza valida E utente loggato (mostra la lobby completa)
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
                        <p className="lobby-room-code">{gameId}</p>
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
                            // VISTA ADMIN: Pulsante "Inizia partita"
                            <button 
                                className="lobby-main-btn" 
                                disabled//onClick={handleStartGame}
                                //disabled={players.length < 2}
                            >
                                Inizia partita
                            </button>
                        ) : (
                            // VISTA UTENTE NORMALE: Pulsante "Pronto"
                            <button 
                                className="lobby-main-btn"
                                disabled //onClick={handleReady}
                            >
                                Pronto
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
                                <span className="sidebar-player-name">
                                    {p}
                                    {p === user.username && ' (tu)'}
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