import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import DiceArena from '../components/DiceArena'; 
import '../style/Game.css';
import '../style/Lobby.css'

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    const { socket, disconnectSocket } = useSocket(); 
    
    const [gameState, setGameState] = useState(null);      
    // 2. CREIAMO UN REF CHE TIENE SEMPRE IL GAMESTATE AGGIORNATO
    const gameStateRef = useRef(gameState);
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 
    
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false); 

    // Manteniamo il ref aggiornato (Per i colori dei dadi tutto questo)
    useEffect(() => {
        gameStateRef.current = gameState;
    }, [gameState]);

    // --- PULIZIA TAVOLO ---
    useEffect(() => {
        if (gameState?.phase || gameState?.round) {
            setActiveRolls([]); 
        }
    }, [gameState?.phase, gameState?.round]);

    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => {
            console.log("Dati pubblici:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePrintDiceRoll = (payload) => {
            const rollId = Date.now() + Math.random();
            
            // 4. QUI LA MAGIA: Usiamo gameStateRef.current invece di gameState
            // Questo ci dà accesso ai dati "freschi" senza rompere la closure
            const currentPlayers = gameStateRef.current?.players || [];
            
            // Cerchiamo il giocatore in questione per prendere il suo colore
            const player = currentPlayers.find(p => p.username === payload.username);
            const diceColor = player ? player.color : '#fffbf0'; // Fallback se non trovato

            const newRoll = {
                id: rollId,
                username: payload.username,
                dice1: payload.dice1,
                dice2: payload.dice2,
                color: diceColor
            };

            // 1. AGGIUNGIAMO IL DADO E FACCIAMO PARTIRE L'ANIMAZIONE
            setActiveRolls(prev => [...prev, newRoll]);
            
            // NOTA: Abbiamo rimosso il setTimeout! 
            // L'aggiornamento dello stato avverrà tramite la callback onRollComplete
        };

        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('parametri');
                socket.off('identityAssigned');
                socket.off('playerRolledDice');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId, user.username]);

    const handleLeaveGame = () => {
        if (window.confirm("Uscire?")) { disconnectSocket(); navigate(`/`); }
    };

    const handleDiceRoll = () => { 
        if(isWaiting) return; 
        setIsWaiting(true);
        if(socket) socket.emit('DiceRoll'); 
    };

    // --- NUOVA FUNZIONE CALLBACK ---
    // Questa viene chiamata da DiceArena quando i dadi di un utente si fermano
    const handleRollComplete = (rollId, username, totalValue) => {
        
        // Sblocca il bottone se ero io
        if (username === user.username) {
            setIsWaiting(false);
        }

        // Aggiorna lo stato per mostrare il numero
        setGameState(prevState => {
            if (!prevState || !prevState.players) return prevState;
            return {
                ...prevState,
                players: prevState.players.map(p => 
                    p.username === username 
                        ? { 
                            ...p, 
                            hasRolled: true, 
                            diceValue: totalValue 
                          } 
                        : p
                )
            };
        });
    };

    if (!socket || !gameState) return <div className="game-loader">Caricamento...</div>;

    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    const isDicePhase = gameState.phase === 'DICE' || gameState.phase === 'lancio_dadi';

    return (
        <div className="game-page">
            <div className="game-card">
                <header className="game-header">
                    <div>
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">Fase: {gameState.phase}</p>
                    </div>
                    <div className="game-room-badge">Stanza: {roomId}</div>
                </header>
                
                <div className="game-secret-section">
                    <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                        {revealSecret ? "Nascondi Identità 🔒" : "Mostra Identità 👁️"}
                    </div>
                    {revealSecret && userIdentity && (
                        <div className="secret-content revealed">
                            <p><strong>Ruolo: </strong> 
                                <span className={userIdentity.role === 'Impostor' ? 'role-impostor' : 'role-civilian'}>
                                    {userIdentity.role}
                                </span>
                            </p>
                            <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                        </div>
                    )}
                </div>

                <div className="game-table-area">
                    {/* DICE ARENA con CALLBACK */}
                    <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                        <DiceArena 
                            activeRolls={activeRolls} 
                            onRollComplete={handleRollComplete} // <--- Passiamo la funzione qui
                        />
                    </div>

                    <div className="players-grid">
                        {gameState.players && gameState.players.map((p) => (
                            <div 
                                key={p.username} 
                                className={`player-slot ${p.username === user.username ? 'me' : ''}`}
                                style={{
                                    // Bordo colorato basato sul colore del player
                                    border: `2px solid ${p.color || '#ccc'}`,
                                    // Effetto ombra colorata (Glow)
                                    boxShadow: `0 0 10px ${p.color || 'rgba(0,0,0,0.1)'}`
                                }}
                            >
                                {/* Sezione Intestazione con Avatar e Nome */}
                                <div className="player-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    
                                    {/* Avatar Colorato con Iniziale */}
                                    <div 
                                        className="player-avatar"
                                        style={{
                                            backgroundColor: p.color || '#777',
                                            width: '35px',
                                            height: '35px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#fff',
                                            fontWeight: 'bold',
                                            fontSize: '18px',
                                            textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                        }}
                                    >
                                        {p.username.charAt(0).toUpperCase()}
                                    </div>

                                    <div className="player-name">
                                        {p.username} {p.username === user.username && <span style={{fontSize: '0.8em', opacity: 0.7}}>(Tu)</span>}
                                    </div>
                                </div>

                                {/* Risultato Dadi */}
                                <div className="dice-result-badge">
                                    {p.hasRolled ? (
                                        <span style={{ color: p.color || '#333', fontWeight: 'bold' }}>
                                            {p.diceValue}
                                        </span>
                                    ) : (
                                        <span style={{ opacity: 0.5 }}>...</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* SIDEBAR GIOCATORI */}
                <aside className="game-sidebar">
                    <h2 className="sidebar-title">Giocatori</h2>
                    <div className="sidebar-players">
                        {gameState.players && gameState.players.map((p, idx) => (
                            <div
                                key={idx}
                                className={
                                    p.username === user.username
                                        ? 'sidebar-player sidebar-player-me'
                                        : 'sidebar-player'
                                }
                            >
                                <span className="sidebar-player-avatar">
                                    {p.username?.[0]?.toUpperCase() || '?'}
                                </span>
                                <span className="sidebar-player-name">
                                    {p.username}
                                    {p.username === user.username && ' (tu)'}
                                    {p.hasRolled && ' ✅'}
                                </span>
                            </div>
                        ))}
                    </div>
                </aside>
                <div className="game-buttons">
                    {isDicePhase && !amIReady ? (
                        <button 
                            className="game-btn-action" 
                            onClick={handleDiceRoll}
                            disabled={isWaiting}
                            style={{ opacity: isWaiting ? 0.6 : 1, cursor: isWaiting ? 'not-allowed' : 'pointer' }}
                        >
                            {isWaiting ? "Lancio in corso..." : "🎲 LANCIA I DADI"}
                        </button>
                    ) : (
                        <p className="status-text">
                            {amIReady ? "Hai già lanciato." : "Attendi..."}
                        </p>
                    )}
                    <button className="game-btn-danger" onClick={handleLeaveGame}>Abbandona</button>
                </div>
            </div>
        </div>
    );
}

export default Game;