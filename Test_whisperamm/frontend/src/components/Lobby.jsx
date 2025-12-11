import React, {useEffect, useState, useContext, useRef} from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import { JanusContext } from '../context/JanusProvider'; 
import { useLobbyValidation } from '../hooks/useLobbyValidation';
import { useLobbySocket } from '../hooks/useLobbySocket';
import { useLobbyHandlers } from '../hooks/useLobbyHandlers';
import '../style/Lobby.css';
import MiniForm from './MiniForm';
import Game from './Game';
import VideoPlayer from './VideoPlayer';

const Lobby = () => {
    
    const { user, setUser } = useAuth();
    const { socket, connectSocket, disconnectSocket } = useSocket();
    const { roomId } = useParams();
    
    // --- JANUS CONTEXT ---
    const { 
        initializeJanus, 
        joinRoom, 
        isJanusReady, 
        status: janusStatus, 
        error: janusError,
        cleanup: cleanupJanus
    } = useContext(JanusContext);
    //Lobby si prende tutto ciò che gli serve, estraendo ciò che mi deriva dal context
    

    // 1. Validation Hook (Fetch iniziale HTTP)
    const { 
        isValidating, 
        lobbyError, 
        setLobbyError,
        roomName, 
        maxPlayers, 
    } = useLobbyValidation(roomId, user);

    // 2. Stati UI Dati
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [players, setPlayers] = useState([]);
    const [roomFull, setRoomFull] = useState("In attesa di altri giocatori...");
    
    // 3. Stati Logica Gioco
    const [isReady, setIsReady] = useState(false);
    const [allReady, setAllReady] = useState(false); 
    const [readyStates, setReadyStates] = useState({});
    const [gameLoading, setGameLoading] = useState(false);
    
    // 4. Stati Ruoli
    const [adminPlayer, setAdminPlayer] = useState(null); 
    const [isAdmin, setIsAdmin] = useState(false); 
    const [canStartGame, setCanStartGame] = useState(false); 

    // --- NUOVO STATO PER IL POPUP "WHAT?" ---
    const [showExitPopup, setShowExitPopup] = useState(false);

    // --- LOGICA DERIVATA ---
    
    useEffect(() => {
        if (user && adminPlayer) {
            setIsAdmin(user.username === adminPlayer);
        }
    }, [user, adminPlayer]);

    useEffect(() => {
        if (isAdmin && allReady) {
            setCanStartGame(true);
        } else {
            setCanStartGame(false);
        }
    }, [isAdmin, allReady]);

    useEffect(() => {
        if (players.length > 0 && maxPlayers && players.length >= maxPlayers) {
            setRoomFull("Stanza piena!");
        } else {
            setRoomFull("In attesa di altri giocatori...");
        }
    }, [players, maxPlayers]);

   
    //Appena l'utente entra in Lobby, ed è appena stato validato (stanza esiste e sappiamo che user è ok)
    //accendiamo la videocamera, inizializzandoJanus
    useEffect(() => {
        if (user && !isValidating) {
            //Appena l'utente è validato, startiamo la connessione con il server Janus
            initializeJanus(); //Setta anche isJanusReady=true, dunque si attiva l'useEffect che tenta di fare joinRoom
            //init->createSession->attachPlugin
//Init crea la base per creare connessione https con server Janus
//Se tutto ok, creiamo la connessione con server janus con createJanusSession();
//A questo punto con l'attachVideoRoomPlugin ottengo la connessione diretta con il plugin VideoRoom.
//Ogni client che si collega avrà un proprio handle verso il plugin VideoRoom, ovvero una propria connessione al plugin videoRoom!
        }
    }, [user, isValidating, initializeJanus]);

    // B. Effettua il Join nella stanza video quando Janus è connesso
    const hasJoinedRef = useRef(false);

    // Reset del flag se cambia la stanza
    useEffect(() => {
        hasJoinedRef.current = false;
    }, [roomId]);

    useEffect(() => {
        // Se Janus è pronto, connesso e non siamo ancora entrati
        //questo dunque è attivato a causa della initializeJanus!!!!
        if (isJanusReady && janusStatus === 'connected' && !hasJoinedRef.current && user) {
            console.log(`🚀 Janus connesso. Tentativo ingresso stanza video: ${roomId}`);
            joinRoom(roomId, user.username); //Qui facciamo il vero e proprio passo nella Room! 
            //E' qui che apriremo il nostro RTCPeerConnection verso il mediaServer
            hasJoinedRef.current = true;
        }
    }, [isJanusReady, janusStatus, roomId, user, joinRoom]);

    // C. Cleanup Janus all'uscita dalla Lobby
    useEffect(() => {
        return () => {
            cleanupJanus();
            hasJoinedRef.current = false;
        };
    }, [cleanupJanus]);

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
   
    // Funzione intermedia: Clicco icona -> Apro Popup
    const onExitClick = () => {
        setShowExitPopup(true);
    };

    // Funzione finale: Confermo nel popup -> Esco davvero
    const confirmExit = () => {
        setShowExitPopup(false);
        handleBackHome(); // Richiama la tua vecchia funzione di uscita
    };

    // --- RENDER ---

    if (gameLoading) return <Game />; 
    if (isValidating) return <div className="lobby-page mini-form-page"><div className="lobby-card"><h1>Verifica...</h1></div></div>;
    if (lobbyError) return <div className="lobby-page"><div className="lobby-card"><h1 style={{color:'red'}}>Errore</h1><p>{lobbyError}</p></div></div>;
    if (!user) return <MiniForm roomId={roomId} onUserCreated={setUser} />;

    return (
        <div className="lobby-page">
            {/* BANNER ERRORE JANUS */}
            {janusError && (
            <div className="janus-error-overlay">
                <div className="janus-error-popup">
                    <div className="popup-header">
                        <span>⚠️ Errore Video</span>
                    </div>
                    <div className="popup-body">
                        <p className="error-message">{janusError}</p>
                        <p className="instruction">Ops, c'è un problema con audio e microfono </p>
                    </div>

                    {/* Opzionale: Bottone per ricaricare la pagina se necessario */}
                    <button className="popup-btn" onClick={handleBackHome}>
                        Continua
                    </button>
                </div>
            </div>
            )}      

            {/* --- POPUP "WHAT?" --- */}
            {showExitPopup && (
                <div className="pixel-overlay">
                    <div className="pixel-bubble">
                        <h1 className="pixel-title">WHAT?</h1>
                        <p className="pixel-subtitle">Te ne vai già?</p>
                        
                        <div className="pixel-buttons">
                            {/* Tasto SI (Rosso, perché è l'azione distruttiva) */}
                            <button className="pixel-btn yes" onClick={confirmExit}>
                                Addio
                            </button>
                            {/* Tasto NO (Verde, resta in gioco) */}
                            <button className="pixel-btn no" onClick={() => setShowExitPopup(false)}>
                                No!
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* -------------------------------- */}

            <div className="lobby-layout">
                {/* 0. TITOLO ESTERNO (FUORI DAL BLOCCO) */}
                <div className="lobby-header-external">
                    LOBBY DI GIOCO
                </div>
                {/* 1. ZONA SUPERIORE: INFO E BOTTONI */}
                <div className="lobby-card">
                    
                    <div className="lobby-info-group">
                        <h1 className="room-name-display">{roomName}</h1>
                        <p className="room-code-line">
                            Il codice della stanza è: <span className="code-highlight">{roomId}</span>
                        </p>
                    </div>
                    
                    {/* Ho rimosso il div Ruolo*/}
                    
                    <div className="lobby-buttons">
                        {isAdmin ? (
                            <button 
                                className="lobby-main-btn admin-btn" 
                                onClick={() => handleStartGame(canStartGame)}
                                disabled={!canStartGame}
                                style={{ opacity: canStartGame ? 1 : 0.5, cursor: canStartGame ? 'pointer' : 'not-allowed' }}
                            >
                                {canStartGame ? 'Inizia Partita' : 'Attendi i Giocatori'}
                            </button>
                        ) : (
                            <button 
                                className={`lobby-main-btn player-btn ${isReady ? 'ready' : ''}`}
                                onClick={handleReady}
                            >
                                {isReady ? 'Pronto' : 'Pronto'}
                            </button>
                        )}
                        <button className="lobby-main-btn exit-btn" onClick={onExitClick} aria-label="Esci"> Esci </button>
                    </div>      
                </div>

                {/* 2. ZONA INTERMEDIA: STATO STANZA */}
                <div className="lobby-status-bar">
                    <p className="lobby-subtitle">{roomFull}</p>
                </div>

                {/* 3. COLONNA SINISTRA: PLAYERS */}
                <aside className="lobby-sidebar">
                    <h2 className="sidebar-title">Giocatori ({players.length}/{maxPlayers})</h2>
                    <div className="sidebar-players">
                        {players.map((p, idx) => (
                            <div key={idx} className={`sidebar-player ${p === user.username ? 'sidebar-player-me' : ''}`}>
                                <span className="sidebar-player-avatar">{p?.[0]?.toUpperCase()}</span>
                                <span className="sidebar-player-name">
                                    {p} {p === user.username && '(tu)'} {p === adminPlayer && '👑'}
                                    {readyStates[p] && p !== adminPlayer && <span className="ready-check"> ✅</span>}    
                                </span>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* 4. COLONNA DESTRA: CHAT */}
                <div className="lobby-chat-column">
                    <div className="chat-container">
                        <h2 className="chat-title">Chat</h2>
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

                                /* 1. FOCUS: Cancella la scritta */
                                onFocus={(e) => {
                                    e.target.placeholder = "";
                                }}

                                /* 2. BLUR: Rimette la scritta e RIALLINEA LA PAGINA */
                                onBlur={(e) => {
                                    e.target.placeholder = "Scrivi...";
                                    
                                    setTimeout(() => {
                                        // INVECE DI SCROLLARE IN FONDO, RESETTIAMO LA VISTA IN ALTO A SINISTRA
                                        // Questo elimina lo spazio bianco della tastiera senza spostarti giù.
                                        window.scrollTo(0, 0); 
                                    }, 100);
                                }}
                            />
                            <button type="submit" className="chat-send-btn">Invia</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Lobby;