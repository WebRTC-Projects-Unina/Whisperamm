import React, { useState, useEffect } from 'react'; 
import '../../style/phaseOrder.css'; 
import VideoPlayer from '../VideoPlayer'; 

const PhaseOrder = ({ 
    gameState, 
    user,
    localStream,    
    remoteStreams 
}) => {
  
    // --- 1. LOGICA TIMER ---
    const calculateTimeLeft = () => {
        const endTime = gameState.endTime;
        if (!endTime) return null; 
        const now = Date.now();
        return Math.max(0, Math.ceil((endTime - now) / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        setTimeLeft(calculateTimeLeft());
        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);
            if (seconds !== null && seconds <= 0) clearInterval(interval);
        }, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime]);


    // ORDINAMENTO ROBUSTO (Morti in fondo, poi per Ordine)
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => {
        const aliveA = a.isAlive !== false;
        const aliveB = b.isAlive !== false;

        // I vivi prima dei morti
        if (aliveA && !aliveB) return -1; 
        if (!aliveA && aliveB) return 1;  

        const orderA = parseInt(a.order);
        const orderB = parseInt(b.order);

        if (!isNaN(orderA) && !isNaN(orderB)) {
            if (orderA === 0) return 1;
            if (orderB === 0) return -1;
            return orderA - orderB;
        }

        const valA = a.diceValue ?? ((a.dice1 || 0) + (a.dice2 || 0));
        const valB = b.diceValue ?? ((b.dice1 || 0) + (b.dice2 || 0));
        return valB - valA; 
    });

    return (
        <div className="phase-order-container">
            
            {/* TIMER */}
            <div className="phase-timer-wrapper">
                <p className="timer-label">Il round inizia tra</p>
                <div className={`timer-display-large ${timeLeft !== null && timeLeft <= 5 ? 'urgent' : ''}`}>
                    {timeLeft !== null ? `${timeLeft}s` : '...'}
                </div>            
            </div>

            <h2 className="phase-title">Ordine di Gioco</h2>
            
            <div className="ranked-list">
                {sortedPlayers.map((p, index) => {

                    const isMe = p.username === user.username;
                    const isDead = p.isAlive === false; 
                    
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);    

                    const totalValue = p.diceValue ?? ((p.dice1 || 0) + (p.dice2 || 0));
                    const displayOrder = isDead ? '-' : (p.order || index + 1);

                    return (
                        <div 
                            key={p.username} 
                            className={`ranked-card ${isMe ? 'me' : ''} ${isDead ? 'dead' : ''}`}
                            style={!isDead ? { borderColor: p.color || '#444' } : {}}
                        >
                            {/* --- VIDEO THUMBNAIL (SINISTRA) --- */}
                            <div className="order-video-thumb">
                                
                                {isDead && <div className="dead-overlay-icon">💀</div>}
                                
                                {streamToRender ? (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} 
                                    />
                                ) : (
                                    <span className="thumb-fallback">
                                        {p.username.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                                                            
                            {/* --- INFO (DESTRA) --- */}
                            <div className="ranked-info-container">
                                <div className="player-details">
                                    <div className="player-name-large">
                                        {p.username} {isMe && <span className="me-tag">TU</span>}
                                    </div>
                                    <div className="roll-info">
                                        {isDead ? "ELIMINATO" : `Totale Dadi: ${totalValue}`}
                                    </div>
                                </div>

                                {/* Chi Inizia (Corona) */}
                                {index === 0 && !isDead && <div className="turn-crown">👑</div>}

                                {/* Numero Posizione Sfondo */}
                                <div className="rank-number">
                                    {isDead ? '' : `#${displayOrder}`}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PhaseOrder;