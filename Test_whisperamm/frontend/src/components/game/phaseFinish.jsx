import React from 'react';
import '../../style/phaseFinish.css';

const PhaseFinish = ({ gameState, user, onLeave }) => {
    const winner = gameState.winner; // "CIVILIANS" o "IMPOSTORS"
    const cause = gameState.cause;   // "guessedImpostors", "killAllCivilians", "roundsExceeded"
    
    const isImpostorWin = winner === 'IMPOSTORS';
    const themeClass = isImpostorWin ? "theme-impostor" : "theme-civilian";

    // Logica per determinare Chi vince 
    const getTextContent = () => {
        if (winner === 'CIVILIANS') {
            return {
                title: "I CIVILI HANNO VINTO!",
                subtitle: "L'impostore è stato eliminato.",
                emoji: "🎉"
            };
        } 
        
        // Se vincono gli impostori...
        if (cause === 'roundsExceeded') {
            return {
                title: "GLI IMPOSTORI VINCONO",
                subtitle: "I civili non hanno trovato il colpevole in tempo (Round esauriti).",
                emoji: "⏳" // Clessidra per indicare il tempo/round finiti
            };
        }

        // Vittoria impostori classica (kill)
        return {
            title: "GLI IMPOSTORI HANNO VINTO",
            subtitle: "I civili sono stati eliminati o superati in numero.",
            emoji: "🔪"
        };
    };

    const content = getTextContent();

    return (
        <div className={`phase-finish-container ${themeClass}`}>
            
            {/* HEADER VITTORIA */}
            <div className="finish-header">
                <div className="winner-icon">{content.emoji}</div>
                <h1 className="winner-title">{content.title}</h1>
                <p className="winner-subtitle">{content.subtitle}</p>
            </div>

            {/* RIEPILOGO GIOCATORI E RUOLI */}
            <div className="finish-players-grid">
                {gameState.players?.map((p) => {
                    const isMe = p.username === user.username;
                    const pRole = p.role || 'CIVILIAN'; 
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

                            {/* Status finale */}
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