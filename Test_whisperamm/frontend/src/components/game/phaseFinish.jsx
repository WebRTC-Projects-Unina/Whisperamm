import React from 'react';
import '../../style/phaseFinish.css';

const PhaseFinish = ({ gameState, user, onLeave }) => {
    const winner = gameState.winner; // "CIVILIANS" o "IMPOSTORS"
    const isImpostorWin = winner === 'IMPOSTORS';

    // Testi e Classi dinamici in base al vincitore
    const titleText = isImpostorWin ? "GLI IMPOSTORI HANNO VINTO" : "I CIVILI HANNO VINTO";
    const themeClass = isImpostorWin ? "theme-impostor" : "theme-civilian";
    const emoji = isImpostorWin ? "🔪" : "🎉";

    return (
        <div className={`phase-finish-container ${themeClass}`}>
            
            {/* HEADER VITTORIA */}
            <div className="finish-header">
                <div className="winner-icon">{emoji}</div>
                <h1 className="winner-title">{titleText}</h1>
                <p className="winner-subtitle">Partita conclusa</p>
            </div>

            {/* RIEPILOGO GIOCATORI E RUOLI */}
            <div className="finish-players-grid">
                {gameState.players?.map((p) => {
                    const isMe = p.username === user.username;
                    const pRole = p.role || 'CIVILIAN'; // Fallback
                    const isPImpostor = pRole === 'IMPOSTOR';
                    
                    return (
                        <div 
                            key={p.username} 
                            className={`finish-card ${isMe ? 'me' : ''} ${isPImpostor ? 'is-impostor' : 'is-civilian'}`}
                        >
                            <div className="player-avatar-large" style={{ backgroundColor: p.color || '#777' }}>
                                {p.username.charAt(0).toUpperCase()}
                            </div>
                            
                            <div className="finish-info">
                                <div className="finish-name">
                                    {p.username} {isMe && "(Tu)"}
                                </div>
                                <div className="finish-role">
                                    {isPImpostor ? "IMPOSTORE" : "CIVILE"}
                                </div>
                            </div>

                            {/* Status finale (Vivo/Morto) */}
                            <div className="finish-status">
                                {p.isAlive ? "🏆 Vivo" : "💀 Morto"}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* FOOTER AZIONI */}
            <div className="finish-footer">
                <button className="game-btn-action btn-home" onClick={onLeave}>
                    TORNA ALLA HOME 🏠
                </button>
            </div>
        </div>
    );
};

export default PhaseFinish;