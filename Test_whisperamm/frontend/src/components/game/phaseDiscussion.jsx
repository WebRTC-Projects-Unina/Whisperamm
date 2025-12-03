import React, { useState, useEffect } from 'react';
import '../../style/phaseDiscussion.css';

const PhaseDiscussion = ({ gameState, user }) => {
    
    // 1. Calcolo tempo rimanente basato sul Server
    // Non usiamo un valore fisso, ma la differenza tra ORA e la FINE stabilita dal server
    const calculateTimeLeft = () => {
        if (!gameState.endTime) return 0;
        const now = Date.now();
        const diff = gameState.endTime - now;
        return Math.max(0, Math.ceil(diff / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const players = gameState.players || [];

    // 2. Timer Sync
    useEffect(() => {
        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);

            // Se il tempo finisce, non facciamo nulla di attivo.
            // Il server cambierà la fase automaticamente e questo componente verrà smontato.
            if (seconds <= 0) {
                clearInterval(interval);
            }
        }, 500); // Aggiornamento fluido

        return () => clearInterval(interval);
    }, [gameState.endTime]);

    return (
        <div className="phase-discussion-container">
            <div className="discussion-header">
                <h2 className="phase-title">Discussione in corso</h2>
                <p className="phase-subtitle">Cercate di trovare l'impostore!</p>
            </div>

            {/* Timer Centrale */}
            <div className="discussion-timer-wrapper">
                <p>Tempo rimanente</p>
                <div className={`timer-display ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    {timeLeft}s
                </div>
            </div>
            
            {/* Griglia Giocatori (Visualizzazione passiva) */}
            <div className="players-container">
                {players.map((player) => {
                    const isMe = player.username === user.username;
                    return (
                        <div 
                            key={player.username}
                            className={`player-card ${isMe ? 'me' : ''}`}
                            style={{ 
                                borderColor: player.color || '#ccc',
                                boxShadow: isMe ? `0 0 15px ${player.color}40` : 'none'
                            }}
                        >
                            <div className="player-avatar-large" style={{ backgroundColor: player.color || '#777' }}>
                                {player.username.charAt(0).toUpperCase()}
                            </div>

                            <div className="player-info-large">
                                <span className="player-name-large">
                                    {player.username} {isMe && <span className="me-tag">(Tu)</span>}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PhaseDiscussion;