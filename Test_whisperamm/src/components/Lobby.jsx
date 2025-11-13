// src/pages/Lobby.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './Lobby.css';

const socket = io('http://localhost:8080', {
  withCredentials: false,
});

function Lobby() {
    const [lobbyName,setLobbyName] = useState('');
    const [isCreated,setIsCreated] = useState(false);
    const navigate = useNavigate();

    // Questo hook legge i "parametri" dall'URL
    // In /lobby/ABCDE, gameId sarà "ABCDE"
    const { gameId } = useParams();

//aggiunta chat socket.io
  // username fisso per testare la chat
    const [username, setUsername] = useState(null); // preso dal backend

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
      
    // 1) recupera username dalla sessione sul server
    useEffect(() => {
      const loadUser = async () => {
        try {
          const res = await fetch('http://localhost:8080/api/me', {
            credentials: 'include', // per inviare cookie di sessione
          });

         if (!res.ok) {
            console.warn('Utente non autenticato, uso Guest');
            setUsername('Guest');
            return;
          }

         const data = await res.json();
          setUsername(data.user.username || 'Guest');
        } catch (err) {
          console.error('Errore caricando /api/me:', err);
          setUsername('Guest');
        }
      };

     loadUser();
    }, []);

    useEffect(() => {
        if (!gameId) return;

        socket.on('connect', () => {
        console.log('Socket connesso, id:', socket.id);
        });

        // entra nella stanza di questa partita
        socket.emit('joinLobby', { gameId, username });

        const handleChatMessage = (msg) => {
        setMessages((prev) => [...prev, msg]);
        };

        socket.on('chatMessage', handleChatMessage);

        return () => {
        socket.off('chatMessage', handleChatMessage);
        };
    }, [gameId, username]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        socket.emit('chatMessage', {
        gameId,
        from: username,
        text: newMessage.trim(),
        });

        setNewMessage('');
    };

    const handleBackHome = () => {
        navigate('/');
    };

    return (
        <div className="lobby-page">
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

            <form className="chat-input-form" onSubmit={handleSubmit}>
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
        </div>
  );
}
export default Lobby;