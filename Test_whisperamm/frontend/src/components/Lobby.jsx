// src/pages/Lobby.jsx
import React, {useEffect, useRef, useState} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthProvider'; // <-- IMPORTA
import '../style/Lobby.css';

function Lobby() {
    
    //Con questa inizializzazione di user, inizializziamo isValidating con un valore
    const { user, setUser } = useAuth();
    //Inizializza isValidating basandoti sulla presenza dell'utente
    const [isValidating, setIsValidating] = useState(!!user);
    //Recuperiamo dunque anche il gameId.
    const { gameId } = useParams();

    //Poichè user e gameId sono inclusi nella dipendenza dell'useEffect1 (HTTP)
    //ne causa l'attivazione immediata al primo render


    const navigate = useNavigate();

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


    const [lobbyError, setLobbyError] = useState(null);

    //useEffect1
    useEffect(() => {
        // Flag per evitare race conditions se il componente si smonta o gameId cambia
        let ignore = false;

        // 1. Reset preventivo
        if (!gameId) {
            setLobbyError("ID partita non trovato.");
            setIsValidating(false);
            return;
        }

        if (!user) {
            setIsValidating(false);
            setLobbyError(null);
            return;
        }

        // 2. Avviamo validazione
        const checkLobby = async () => {
            // IMPORTANTE: Diciamo a tutti "Sto lavorando, fermi!"
            setIsValidating(true);  
            //Non dovrebbe servire, dato che entro qui proprio grazie a user, 
            //Ma user ha già settato isValidating=(!!user).
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
                    //Se è tutto ok..
                    setLobbyError(null);
                    setRoomName(data.roomName || '');
                    setMaxPlayers(data.maxPlayers || null);
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
        return () => {ignore = true;};

    }, [user, gameId]); //forse non dovrebbe servire osservare gameID


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


    // LOGICA SOCKET (Si attiva solo se l'utente e la stanza sono validi) ---
    //useEffect2
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

        // Non connetterti se non c'è un utente, infatti isValidating sta nel finally precedente, 
        // dunque mettere il controllo sul lobby error anche qui in or è ridondante.
        if (!user || lobbyError) {
            return;
        }

        console.log("Validazione passata, connessione Socket in corso...");
        const socketConnect = async () => {
            //Creo l'oggetto socket client che tenterà la connessione al mio server
            const socket = io('http://localhost:8080', {
                withCredentials: true,  
                //per includere il cookie jwt nella
                //Http request che precede l'upgrade a webSocket
            });

            //Salvataggio dell'isanza in un useRef, così che possano usarla per inviare messaggi
            socketRef.current = socket;

            //Creata la socket però non è immediatamente stabilita, ma
            //il client invia HTTP Request per poi Upgradare a webSocket --> emesso l'evento 'connect'
            // Gestisci l'evento 'connect'
            socket.on('connect', () => {
                console.log('Socket connesso, id:', socket.id);
                socket.emit('joinLobby', { gameId, user});
            });


            const handleLobbyPlayers = (payload) => {
                setPlayers(payload.players || []);
            };

            const handleChatMessage = (msg) => {
                setMessages((prev) => [...prev, msg]);
            };
            
            
            const handleLobbyError = (error) => {
                setLobbyError(error.message || "Errore dalla stanza");
                socketRef.current.disconnect();
            };
            
            
            socket.on('lobbyError', handleLobbyError); //gestione errori lobby
            socket.on('lobbyPlayers', handleLobbyPlayers); //gestione player in room
            socket.on('chatMessage', handleChatMessage); //gestione messaggi chat
            
        };
        
        socketConnect();

            // Funzione di cleanup
        return () => {
            socket.off('chatMessage', handleChatMessage);
            socket.off('lobbyPlayers', handleLobbyPlayers);
            socket.off('lobbyError', handleLobbyError);

            socket.disconnect()
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

    // Gestore per tornare alla Home
    const handleBackHome = () => {
        //forse qui ci vuole anche la disconnessione socket
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
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

                    <div className="lobby-buttons">
                        {/* Metti qui i pulsanti che vuoi (es. Pronto, Avvia partita, Esci, ecc.) */}
                        <button className="lobby-main-btn" disabled>
                            Pronto/Inizia partita (in arrivo...)
                        </button>
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