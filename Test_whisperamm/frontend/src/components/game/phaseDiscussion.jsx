import React, { useState, useEffect } from 'react';
import '../../style/phaseDiscussion.css';

const PhaseDiscussion = ({ gameState, user, socket }) => {
    const [timeLeft, setTimeLeft] = useState(60);
    const players = gameState.players || [];

    
    // Timer
    useEffect(() => {
        if (timeLeft === 0) {
            console.log("⏰ Timer finito! Passaggio a PhaseVoting...");
            if (socket) {
                socket.emit('DiscussionPhaseComplete');
            }
            return;
        }

        const interval = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [timeLeft, socket]);

    return (
        <div className="phase-discussion-container">
            <h2 className="phase-title">Discussione in corso... Cercate di trovare l'impostore</h2>

            <p>Tempo rimanente</p>
            <div className={`timer-display ${timeLeft <= 5 ? 'urgent' : ''}`}>
                {timeLeft}s
            </div>
            
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