// src/components/game/PhaseDice.jsx
import React, { useState, useEffect } from 'react'; 
import DiceArena from './subgame/DiceArena'; 
import RollingDiceIcon from './subgame/RollingDiceIcon'; 
import VideoPlayer from '../VideoPlayer'; // Assicurati del percorso

const PhaseDice = ({ 
    gameState, 
    user, 
    activeRolls, 
    onRollComplete, 
    onDiceRoll, 
    isWaiting,
    localStream, 
    remoteStreams
}) => {
    
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    const endTime = gameState.endTime;

    const calculateTimeLeft = () => {
        if (!endTime) return null; 
        const now = Date.now();
        const diff = endTime - now;
        return Math.max(0, Math.floor(diff / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft()); 

    useEffect(() => {
        if (!endTime) {
            setTimeLeft(null);
            return;
        }
        if (amIReady) return;

        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);
            if (seconds !== null && seconds <= 0) {
                clearInterval(interval);
                if (!amIReady && !isWaiting) {
                    onDiceRoll(); 
                }
            }
        }, 500);
        setTimeLeft(calculateTimeLeft());
        return () => clearInterval(interval);
    }, [endTime, amIReady, isWaiting, onDiceRoll]);

    return (
        <>
            {!amIReady && (
                <div className="dice-phase-timer">
                    <p>Tempo Rimanente</p>
                    <div className={`timer-display ${(timeLeft !== null && timeLeft <= 5) ? 'urgent' : ''}`}>
                        {timeLeft !== null ? `${timeLeft}s` : <span style={{fontSize:'1rem'}}>...</span>}
                    </div>
                </div>
            )}
            
            <div className="game-content-row">
                <div className="game-table-area">
                    <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                        <DiceArena activeRolls={activeRolls} onRollComplete={onRollComplete} />
                    </div>
                </div>

                <aside className="game-sidebar">
                    <h2 className="sidebar-title">Lancio Dadi</h2>
                    <div className="sidebar-players">
                        {/* INIZIO DEL MAP: Qui p è definito */}
                        {gameState.players && gameState.players.map((p, idx) => {
                            
                            // --- LOGICA AUDIO (DEVE STARE QUI DENTRO) ---
                            const isMe = p.username === user.username;
                            const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                            const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                            return (
                                <div
                                    key={idx}
                                    className={`sidebar-player ${isMe ? 'me' : ''}`}
                                    style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                        
                                        {/* AVATAR ORIGINALE + VIDEO INVISIBILE */}
                                        <span 
                                            className="sidebar-player-avatar" 
                                            style={{ backgroundColor: p.color || '#d249ff', position: 'relative' }}
                                        >
                                            {/* Iniziale */}
                                            {p.username?.[0]?.toUpperCase() || '?'}

                                            {/* Player Invisibile per l'audio */}
                                            {streamToRender && (
                                                <VideoPlayer 
                                                    stream={streamToRender} 
                                                    isLocal={isMe} 
                                                    audioOnly={true} 
                                                />
                                            )}
                                            
                                            {/* (Opzionale) Pallino verde se c'è audio */}
                                            {streamToRender && (
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '-2px',
                                                    right: '-2px',
                                                    width: '10px',
                                                    height: '10px',
                                                    backgroundColor: '#2ecc71',
                                                    borderRadius: '50%',
                                                    border: '1px solid white'
                                                }}/>
                                            )}
                                        </span>

                                        <span className="sidebar-player-name">
                                            {p.username} {isMe && ' (Tu)'}
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
                            );
                        })}
                    </div>
                </aside>
            </div>

            <div className="game-footer">
                <div className="game-buttons">
                    {!amIReady ? (
                        <button 
                            className="game-btn-action" 
                            onClick={onDiceRoll}
                            disabled={isWaiting}
                            style={{ opacity: isWaiting ? 0.6 : 1, cursor: isWaiting ? 'not-allowed' : 'pointer' }}
                        >
                            {isWaiting ? "Lancio in corso..." : "🎲 LANCIA I DADI"}
                        </button>
                    ) : (
                        <p className="status-text">Hai già lanciato. Attendi gli altri...</p>
                    )}
                </div>
            </div>
        </>
    );
};

export default PhaseDice;