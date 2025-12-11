import React, { useState, useEffect } from 'react';
import '../../style/phaseVoting.css';
import VideoPlayer from '../VideoPlayer'; // <--- IMPORTA IL PLAYER

const PhaseVoting = ({ 
    gameState, 
    user, 
    socket,
    localStream,    // <--- RICEVI STREAM DAL GAME
    remoteStreams
}) => {
    
    // --- 1. LOGICA TIMER ---
    const calculateTimeLeft = () => {
        const endTime = gameState.endTime;
        if (!endTime) return 0;
        const now = Date.now();
        return Math.max(0, Math.ceil((endTime - now) / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [selectedPlayer, setSelectedPlayer] = useState(null); 
    const [hasConfirmed, setHasConfirmed] = useState(false);    

    // Info Player
    const alivePlayers = gameState.players?.filter(p => p.isAlive) || [];
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIAlive = myPlayer?.isAlive;
    const serverSaysIVoted = myPlayer?.hasVoted;

    useEffect(() => {
        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);
            if (seconds <= 0) clearInterval(interval);
        }, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime]);

    // --- HANDLERS ---
    const handleSelect = (targetUsername) => {
        if (!amIAlive || hasConfirmed || serverSaysIVoted || timeLeft <= 0) return;
        if (selectedPlayer === targetUsername) {
            setSelectedPlayer(null);
        } else {
            setSelectedPlayer(targetUsername);
        }
    };

    const submitVote = (target) => {
        if (!socket) return;
        console.log(`📤 Invio voto per: ${target || "ASTENSIONE"}`);
        socket.emit('Vote', { voteFor: target }); 
        setHasConfirmed(true);
        setSelectedPlayer(null);
    };

    const isInteractionLocked = !amIAlive || hasConfirmed || serverSaysIVoted || timeLeft <= 0;

    return (
        <div className="phase-voting-container">
            
            <div className="voting-header">
                <h2 className="phase-title">
                    {isInteractionLocked && amIAlive ? "Voto Inviato" : "Chi vuoi eliminare?"}
                </h2>
                <p className="phase-subtitle">
                    {!amIAlive ? "Sei uno spettatore..." : "Scegli un sospettato o astieniti."}
                </p>
                
                <div className={`voting-timer ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    <span className="timer-icon">⏱️</span>
                    {timeLeft}s
                </div>
            </div>

            {/* GRIGLIA GIOCATORI VIVI */}
            <div className="voting-grid">
                {alivePlayers.map((p) => {
                    const isMe = p.username === user.username;
                    const isSelected = selectedPlayer === p.username;
                    const hasVotedBadge = p.hasVoted; 

                    // --- RECUPERO LO STREAM ---
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={p.username}
                            className={`voting-card 
                                ${isSelected ? 'selected' : ''} 
                                ${isInteractionLocked ? 'locked' : ''}
                                ${isMe ? 'me' : ''}
                            `}
                            onClick={() => handleSelect(p.username)}
                            style={{ borderColor: isSelected ? '#ff4444' : (p.color || '#444') }}
                        >
                            {/* --- AVATAR / VIDEO GRANDE --- */}
                            <div 
                                className="player-avatar-voting-large" 
                                style={{ 
                                    backgroundColor: p.color || '#777',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Fallback Lettera */}
                                {!streamToRender && p.username.charAt(0).toUpperCase()}

                                {/* VIDEO ATTIVO */}
                                {streamToRender && (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} // Vediamo le facce!
                                        // muted={true} // Scommenta se vuoi silenziarli durante il voto
                                    />
                                )}
                            </div>
                            
                            {/* Nome */}
                            <div className="voting-name">
                                {p.username} {isMe && "(Tu)"}
                            </div>

                            {/* Indicatori Stato */}
                            {isSelected && <div className="target-icon">🎯</div>}
                            {hasVotedBadge && !isMe && <div className="voted-badge">Ha votato</div>}
                        </div>
                    );
                })}
            </div>

            {/* FOOTER AZIONI */}
            {!isInteractionLocked && (
                <div className="voting-footer">
                    <button 
                        className="btn-abstain"
                        onClick={() => submitVote(null)}
                    >
                        🤷 ASTIENITI
                    </button>

                    <button 
                        className="game-btn-action btn-confirm-vote"
                        disabled={!selectedPlayer}
                        onClick={() => submitVote(selectedPlayer)}
                        style={{ 
                            opacity: selectedPlayer ? 1 : 0.5,
                            cursor: selectedPlayer ? 'pointer' : 'not-allowed'
                        }}
                    >
                        {selectedPlayer ? `VOTA ${selectedPlayer.toUpperCase()} 🔪` : "SELEZIONA"}
                    </button>
                </div>
            )}

            {(hasConfirmed || serverSaysIVoted) && (
                <div className="waiting-others-msg">
                    <div className="loader-dots"></div>
                    In attesa degli altri voti...
                </div>
            )}
        </div>
    );
};

export default PhaseVoting;