import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import DiceArena from '../components/DiceArena'; 
import RollingDiceIcon from '../components/RollingDiceIcon'; // <--- IMPORTANTE: Assicurati di aver creato questo componente
import '../style/Game.css';
import '../style/Lobby.css'

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    const { socket, disconnectSocket } = useSocket(); 
    
    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 
    
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false); 

    // Ref per accedere allo stato corrente nei listener
    const gameStateRef = useRef(gameState);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

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
            
            // Recupera il colore dal giocatore nello stato
            const playerInState = gameStateRef.current?.players?.find(p => p.username === payload.username);
            const playerColor = payload.color || playerInState?.color || '#ffffff';

            const newRoll = {
                id: rollId,
                username: payload.username,
                dice1: payload.dice1,
                dice2: payload.dice2,
                color: playerColor
            };

            // 1. ANIMAZIONE 3D
            setActiveRolls(prev => [...prev, newRoll]);
        };

        
        const handlePhaseChange = (payload) => {
            console.log("Cambio fase:", payload);
            setGameState(prevState => {
                if (!prevState) return payload;
                return {
                    ...prevState,      
                    ...payload,        
                };
            });
        }

        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        socket.on('phaseChanged', handlePhaseChange);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('parametri');
                socket.off('identityAssigned');
                socket.off('playerRolledDice');
                socket.off('phaseChange');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]); // Rimosso user.username per evitare re-render ciclici

    const handleLeaveGame = () => {
        if (window.confirm("Uscire?")) { disconnectSocket(); navigate(`/`); }
    };

    const handleDiceRoll = () => { 
        if(isWaiting) return; 
        setIsWaiting(true);
        if(socket) socket.emit('DiceRoll'); 
    };

    // --- CALLBACK FINE ANIMAZIONE ---
    const handleRollComplete = (rollId, username, totalValue) => {
        if (username === user.username) {
            setIsWaiting(false);
        }

        // Aggiorna lo stato per mostrare il numero e la spunta verde
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
                
                {/* HEADER e SECRET SECTION rimangono in alto */}
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

                {/* --- NUOVO CONTENITORE FLEX PER AFFIANCARE TAVOLO E SIDEBAR --- */}
                <div className="game-content-row">
                    
                    {/* 1. TAVOLO (Sinistra, elastico) */}
                    <div className="game-table-area">
                        <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                            <DiceArena 
                                activeRolls={activeRolls} 
                                onRollComplete={handleRollComplete} 
                            />
                        </div>
                    </div>

                    {/* 2. SIDEBAR (Destra, fissa) */}
                    <aside className="game-sidebar">
                        <h2 className="sidebar-title">Giocatori</h2>
                        <div className="sidebar-players">
                            {gameState.players && gameState.players.map((p, idx) => (
                                <div
                                    key={idx}
                                    className={`sidebar-player ${p.username === user.username ? 'me' : ''}`}
                                    style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                        <span 
                                            className="sidebar-player-avatar" 
                                            style={{ backgroundColor: p.color || '#d249ff' }}
                                        >
                                            {p.username?.[0]?.toUpperCase() || '?'}
                                        </span>
                                        <span className="sidebar-player-name">
                                            {p.username}
                                            {p.username === user.username && ' (Tu)'}
                                        </span>
                                    </div>

                                    <div className="sidebar-roll-status">
                                        {p.hasRolled ? (
                                            <div className="status-done">
                                                <span className="dice-value-small">{p.diceValue}</span>
                                                <span className="check-icon">✅</span>
                                            </div>
                                        ) : (
                                            <div className="status-waiting">
                                                <RollingDiceIcon />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>

                </div> 
                {/* Fine game-content-row */}

                {/* FOOTER BOTTONI */}
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