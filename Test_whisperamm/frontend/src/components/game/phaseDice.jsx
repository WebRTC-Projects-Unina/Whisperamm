// src/components/game/PhaseDice.jsx
import React, { useState, useEffect } from 'react'; 
import DiceArena from './subgame/DiceArena'; // Assicurati che il path sia corretto rispetto alla tua struttura
import RollingDiceIcon from './subgame/RollingDiceIcon'; // Idem

const PhaseDice = ({ 
    gameState, 
    user, 
    activeRolls, 
    onRollComplete, 
    onDiceRoll, 
    isWaiting
}) => {
    
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    const endTime = gameState.endTime;

    // Calcolo iniziale
    const calculateTimeLeft = () => {
        // Se non c'è ancora endTime, ritorniamo NULL (non 0) per indicare "non pronto"
        if (!endTime) return null; 
        const now = Date.now();
        const diff = endTime - now;
        return Math.max(0, Math.floor(diff / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft()); 

    useEffect(() => {
        // Se non c'è endTime, aspettiamo che arrivi
        if (!endTime) {
            setTimeLeft(null);
            return;
        }

        // Se ho già lanciato, non serve aggiornare
        if (amIReady) return;

        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);

            if (seconds !== null && seconds <= 0) {
                clearInterval(interval);
                if (!amIReady && !isWaiting) {
                    console.log("⏰ Tempo scaduto! Auto-lancio...");
                    onDiceRoll(); 
                }
            }
        }, 500);

        // Primo aggiornamento immediato per evitare lag visivo
        setTimeLeft(calculateTimeLeft());

        return () => clearInterval(interval);
    }, [endTime, amIReady, isWaiting, onDiceRoll]);

    return (
        <>
            {/* Sezione Timer (visibile solo se non ho ancora lanciato) */}
            {!amIReady && (
                <div className="dice-phase-timer">
                    <p>Tempo Rimanente</p>
                    {/* Se timeLeft è null (loading), mostriamo un placeholder o nulla */}
                    <div className={`timer-display ${(timeLeft !== null && timeLeft <= 5) ? 'urgent' : ''}`}>
                        {timeLeft !== null ? `${timeLeft}s` : <span style={{fontSize:'1rem'}}>...</span>}
                    </div>
                </div>
            )}

            <div className="game-content-row">
                {/* 1. TAVOLO (Sinistra) */}
                <div className="game-table-area">
                    <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                        <DiceArena 
                            activeRolls={activeRolls} 
                            onRollComplete={onRollComplete} 
                        />
                    </div>
                </div>

                {/* 2. SIDEBAR (Destra) */}
                <aside className="game-sidebar">
                    <h2 className="sidebar-title">Lancio Dadi</h2>
                    <div className="sidebar-players">
                        {gameState.players && gameState.players.map((p, idx) => (
                            <div
                                key={idx}
                                className={`sidebar-player ${p.username === user.username ? 'me' : ''}`}
                                style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                    <span className="sidebar-player-avatar" style={{ backgroundColor: p.color || '#d249ff' }}>
                                        {p.username?.[0]?.toUpperCase() || '?'}
                                    </span>
                                    <span className="sidebar-player-name">
                                        {p.username} {p.username === user.username && ' (Tu)'}
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
                                            <span className="waiting-text">...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>
            </div>

            {/* FOOTER BOTTONI */}
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