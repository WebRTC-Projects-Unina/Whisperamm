// src/pages/Lobby.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext'; // <-- 1. IMPORTA
import './Lobby.css';

// Rimuoviamo lo socket da qui
// const socket = io(...);

function Lobby() {
    // --- 2. STATI PRINCIPALI ---
    const { gameId } = useParams();
    const navigate = useNavigate();
    // Prendiamo 'user' (per leggere) e 'setUser' (per scrivere)
    const { user, setUser } = useAuth();

    // --- 3. STATI DELLA LOBBY (i tuoi originali) ---
    const [socket, setSocket] = useState(null); // Stato per lo socket
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);

    // --- 4. STATI PER IL MINI-FORM (nuovi) ---
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(null);

    // --- 5. LOGICA SOCKET (Si attiva solo se 'user' esiste) ---
    useEffect(() => {
        // Se non c'è utente, non connettere lo socket
        if (!user) return;

        // Creiamo lo socket solo ora
        const newSocket = io('http://localhost:8080', {
            withCredentials: false,
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket connesso, id:', newSocket.id);
        });

        // Entra nella stanza usando l'utente dal context
        newSocket.emit('joinLobby', { gameId, username: user.username });

        const handleChatMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };

        const handleLobbyPlayers = (payload) => {
            if (payload?.gameId !== gameId) return;
            setPlayers(payload.players || []);
        };

        newSocket.on('chatMessage', handleChatMessage);
        newSocket.on('lobbyPlayers', handleLobbyPlayers);

        // Pulizia
        return () => {
            newSocket.off('chatMessage', handleChatMessage);
            newSocket.off('lobbyPlayers', handleLobbyPlayers);
            newSocket.disconnect();
        };
    }, [gameId, user]); // Dipende da 'user'

    // --- 6. GESTORE SUBMIT PER LA CHAT ---
    // (Questo era il tuo 'handleSubmit' originale)
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

    // --- 7. GESTORE PER IL MINI-FORM (nuovo) ---
    const handleJoinRegister = async (e) => {
        e.preventDefault();
        setError(null);
        if (usernameInput.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }
        try {
            // Chiamata identica a quella di Registrazione.jsx
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Nome già in uso');
            }
            // LA MAGIA: Salviamo l'utente nel context.
            // Questo farà ri-renderizzare il componente
            // e mostrerà la lobby vera e propria.
            setUser(data.user);
        } catch (err) {
            setError(err.message);
        }
    };

    // Il tuo gestore per tornare indietro
    const handleBackHome = () => {
        navigate('/');
    };

    // --- 8. RENDER CONDIZIONALE ---

    // CASO A: L'utente NON è loggato (mostra il mini-form)
    if (!user) {
        return (
            // Uso le tue classi CSS per mantenere lo stile
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
                        {error && <p className="error-message" style={{color: 'red', marginTop: '10px'}}>{error}</p>}
                    </div>
                    {/* Non mostriamo la sidebar dei player se non è loggato */}
                </div>
            </div>
        );
    }

    // CASO B: L'utente È loggato (mostra la tua lobby originale)
    // Questo è il tuo JSX originale, al 100%.
    // L'unica modifica è 'handleSubmitChat' e 'user.username'.
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

                    {/* SEZIONE CHAT (Tuo codice originale) */}
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

                        {/* Form della chat (aggiornato on Submit) */}
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

                {/* Sidebar (Tuo codice originale, aggiornato con user.username) */}
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
                                    p === user.username // <-- Usa 'user.username'
                                        ? 'sidebar-player sidebar-player-me'
                                        : 'sidebar-player'
                                }
                            >
                <span className="sidebar-player-avatar">
                  {p?.[0]?.toUpperCase() || '?'}
                </span>
                                <span className="sidebar-player-name">
                  {p}
                                    {p === user.username && ' (tu)'} {/* <-- Usa 'user.username' */}
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