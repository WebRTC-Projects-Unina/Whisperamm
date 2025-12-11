import React, { useState, useEffect } from 'react';
import '../../style/phaseDiscussion.css';
import VideoPlayer from '../VideoPlayer'; // <--- IMPORTA IL PLAYER

const PhaseDiscussion = ({ 
    gameState, 
    user,
    localStream,    // <--- Props audio/video
    remoteStreams,
    toggleAudio // <--- 1. RICEVI LA FUNZIONE
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

    // --- 2. ATTIVA AUDIO PER TUTTI ALL'INGRESSO ---
    useEffect(() => {
        // Appena inizia la fase discussione, accendi il mic!
        if (toggleAudio) {
            console.log("🗣️ Inizio Discussione: Audio ON");
            toggleAudio(true);
        }

        // Quando finisce la discussione (unmount), spegni il mic
        return () => {
            if (toggleAudio) toggleAudio(false);
        };
    }, [toggleAudio]);

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
            
            {/* Griglia Giocatori (Tutti visibili) */}
            <div className="discussion-players-container">
                {players.map((player) => {
                    const isMe = player.username === user.username;
                    const isDead = player.isAlive === false; // Se uno muore, magari lo mostriamo spento o barrato

                    // --- LOGICA STREAM ---
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === player.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={player.username}
                            className={`discussion-player-card ${isMe ? 'me' : ''} ${isDead ? 'dead' : ''}`}
                            style={{ 
                                borderColor: isDead ? '#444' : (player.color || '#ccc'),
                                boxShadow: isMe ? `0 0 15px ${player.color}40` : 'none',
                                opacity: isDead ? 0.6 : 1
                            }}
                        >
                            {/* AVATAR + VIDEO PLAYER */}
                            <div 
                                className="discussion-player-avatar-large" 
                                style={{ 
                                    backgroundColor: isDead ? '#333' : (player.color || '#777'),
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Fallback iniziale */}
                                {!streamToRender && player.username.charAt(0).toUpperCase()}

                                {/* VIDEO PLAYER: Mostriamo video e audio per TUTTI (se vivi) */}
                                {streamToRender && !isDead && (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={player.username}
                                        audioOnly={false} // <--- VIDEO ATTIVO!
                                    />
                                )}
                            </div>

                            <div className="player-info-large">
                                <span className="player-name-large" style={{ textDecoration: isDead ? 'line-through' : 'none' }}>
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