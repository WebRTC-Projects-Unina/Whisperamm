// src/components/game/PhaseDice.jsx
import React from 'react';
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

    return (
        <>
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

            {/* FOOTER BOTTONI SPECIFICO PER QUESTA FASE */}
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