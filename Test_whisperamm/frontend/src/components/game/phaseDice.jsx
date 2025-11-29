// src/components/game/PhaseDice.jsx
import React, { useState, useEffect } from 'react'; 
import DiceArena from '../DiceArena';
import RollingDiceIcon from '../RollingDiceIcon';

const PhaseDice = ({ 
    gameState, 
    user, 
    activeRolls, 
    onRollComplete, 
    onDiceRoll, 
    isWaiting
}) => {
    
    // Calcoliamo qui se l'utente ha già lanciato
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;

    // --- LOGICA TIMER E AUTO-LANCIO ---
    const [timeLeft, setTimeLeft] = useState(15); 

    useEffect(() => {
        // 1. Se il tempo è scaduto...
        if (timeLeft === 0) {
            // ...e non ho ancora lanciato e non sto già aspettando...
            if (!amIReady && !isWaiting) {
                console.log("⏰ Tempo scaduto! Auto-lancio in corso...");
                onDiceRoll(); // <--- SIMULA IL CLICK DEL BOTTONE
            }
            return;
        }

        // 2. Se ho già lanciato, fermiamo il countdown (opzionale, ma pulito)
        if (amIReady) return;

        // 3. Countdown normale
        const interval = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [timeLeft, amIReady, isWaiting, onDiceRoll]);

    return (
        <>
            {/* Sezione Timer (visibile solo se non ho ancora lanciato) */}
            {!amIReady && (
                <div className="dice-phase-timer">
                    <p>Tempo Rimanente</p>
                    <div className={`timer-display ${timeLeft <= 5 ? 'urgent' : ''}`}>
                        {timeLeft}s
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
                            disabled={isWaiting} // Non disabilitiamo più con timeLeft === 0
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