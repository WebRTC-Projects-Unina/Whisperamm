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
        const diff = Math.max(0, Math.ceil((endTime - now) / 1000));
        return diff;
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


    // ORDINAMENTO ROBUSTO
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => {
        const aliveA = a.isAlive !== false;
        const aliveB = b.isAlive !== false;

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
                    
                    // Logica Stream
                    const remote = remoteStreams.find(r => r.display === p.username);
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);    

                    const totalValue = p.diceValue ?? ((p.dice1 || 0) + (p.dice2 || 0));
                    const displayOrder = isDead ? '-' : (p.order || index + 1);

                    return (
                        <div 
                            key={p.username} 
                            className={`ranked-card ${isMe ? 'me' : ''} ${isDead ? 'dead' : ''}`}
                            style={{ 
                                borderColor: isDead ? '#444' : (p.color || '#ccc'),
                                boxShadow: isMe ? `0 0 15px ${p.color}40` : 'none',
                                opacity: isDead ? 0.6 : 1 
                            }}
                        >
                            {/* Badge Posizione */}
                            <div className="rank-badge" style={{ backgroundColor: isDead ? '#222' : (p.color || '#444') }}>
                                {isDead ? '💀' : `#${displayOrder}`}
                            </div>

                            {/* Avatar + VIDEO PLAYER (Tutto dentro questo div) */}
                            <div className="player-avatar-large" style={{ 
                                backgroundColor: isDead ? '#333' : (p.color || '#777'),
                                position: 'relative' // Fondamentale per posizionare il pallino verde
                            }}>
                                {p.username.charAt(0).toUpperCase()}

                                {/* 2. PLAYER INVISIBILE (Corretto: aggiunto &&) */}
                                {streamToRender && !isDead && (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        audioOnly={true} 
                                    />
                                )}

                                {/* 3. Pallino verde audio */}
                                {streamToRender && !isDead && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '0',
                                        right: '0',
                                        width: '15px',
                                        height: '15px',
                                        backgroundColor: '#2ecc71',
                                        borderRadius: '50%',
                                        border: '2px solid white'
                                    }} title="Audio Attivo"/>
                                )}
                            </div>
                                                            
                            {/* Info Giocatore */}
                            <div className="player-info-large">
                                <span className="player-name-large" style={{ textDecoration: isDead ? 'line-through' : 'none' }}>
                                    {p.username} {isMe && <span className="me-tag">(Tu)</span>}
                                </span>
                                <span className="roll-info">
                                    {isDead ? (
                                        <span style={{color: '#ff4444'}}>ELIMINATO</span>
                                    ) : (
                                        <>Ha totalizzato: <strong>{totalValue}</strong></>
                                    )}
                                </span>
                            </div>

                            {/* Indicatore visivo */}
                            <div className="turn-indicator">
                                {index === 0 && !isDead && <span>👑 Inizia</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PhaseOrder;