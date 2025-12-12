import React, { useState, useEffect } from 'react';
import '../../style/phaseDiscussion.css';
import VideoPlayer from '../VideoPlayer'; 

const PhaseDiscussion = ({ 
    gameState, 
    user,
    localStream,    
    remoteStreams,
    toggleAudio 
}) => {
    
    // 1. Calcolo tempo rimanente
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
            if (seconds <= 0) clearInterval(interval);
        }, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime]);

    // 3. Audio Control
    useEffect(() => {
        if (toggleAudio) {
            // console.log("🗣️ Inizio Discussione: Audio ON"); // Debug opzionale
            toggleAudio(true);
        }
        return () => {
            if (toggleAudio) toggleAudio(false);
        };
    }, [toggleAudio]);

    return (
        <div className="phase-discussion-container">
            <div className="discussion-header">
                <h2 className="phase-title">Discussione</h2>
                <p className="phase-subtitle">Trovate l'impostore!</p>
            </div>

            {/* Timer Centrale */}
            <div className="discussion-timer-wrapper">
                <span className="timer-label">Tempo Rimanente</span>
                <div className={`timer-display ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    {timeLeft}s
                </div>
            </div>
            
            {/* Griglia Giocatori "Gallery View" */}
            <div className="discussion-players-container">
                {players.map((player) => {
                    const isMe = player.username === user.username;
                    const isDead = player.isAlive === false; 

                    const remote = remoteStreams ? remoteStreams.find(r => r.display === player.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={player.username}
                            className={`discussion-player-card ${isMe ? 'me' : ''} ${isDead ? 'dead' : ''}`}
                            // Il colore del giocatore definisce il bordo della cornice (se vivo)
                            style={{ 
                                borderColor: isDead ? '#444' : (player.color || '#ccc')
                            }}
                        >
                            {/* CONTENITORE VIDEO (DENTRO LA CORNICE) */}
                            <div className="discussion-video-container" style={{ backgroundColor: player.color || '#222' }}>
                                
                                {/* Mostriamo il video ANCHE SE MORTO (il CSS lo renderà B/N) */}
                                {streamToRender ? (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={player.username}
                                        audioOnly={false} 
                                    />
                                ) : (
                                    /* Fallback Iniziale */
                                    <div className="discussion-fallback">
                                        {player.username.charAt(0).toUpperCase()}
                                    </div>
                                )}

                                {/* OVERLAY LA X SE MORTO */}
                                {isDead && (
                                    <div className="discussion-dead-x">X</div>
                                )}

                                {/* OVERLAY INFO (Nome in basso) */}
                                <div className="discussion-info-overlay">
                                    <span 
                                        className="player-name-overlay" 
                                        // Rimosso line-through, la X è sufficiente
                                        style={{ opacity: isDead ? 0.8 : 1 }} 
                                    >
                                        {player.username} {isMe && "(Tu)"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PhaseDiscussion;