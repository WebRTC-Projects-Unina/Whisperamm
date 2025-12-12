import React, { useState, useEffect } from 'react';
import '../../style/phaseVoting.css';
import VideoPlayer from '../VideoPlayer'; 

const PhaseVoting = ({ 
    gameState, 
    user, 
    socket,
    localStream,    
    remoteStreams
}) => {
    
    const calculateTimeLeft = () => {
        const endTime = gameState.endTime;
        if (!endTime) return 0;
        const now = Date.now();
        return Math.max(0, Math.ceil((endTime - now) / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [selectedPlayer, setSelectedPlayer] = useState(null); 
    const [hasConfirmed, setHasConfirmed] = useState(false);    

    // --- MODIFICA 1: PRENDIAMO TUTTI I GIOCATORI (anche i morti) ---
    const allPlayers = gameState.players || [];
    
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
        // Logica di blocco: Se sono morto, ho già votato, o il tempo è scaduto
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
                    {!amIAlive ? "Sei uno spettatore..." : "Tocca per selezionare."}
                </p>
                
                <div className={`voting-timer ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    <span className="timer-icon">⏱️</span>
                    {timeLeft}s
                </div>
            </div>

            {/* GRIGLIA FLUIDA */}
            <div className="voting-grid">
                {allPlayers.map((p) => {
                    const isMe = p.username === user.username;
                    const isSelected = selectedPlayer === p.username;
                    const hasVotedBadge = p.hasVoted; 
                    
                    // Controlla se il giocatore è morto
                    const isDead = !p.isAlive;

                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={p.username}
                            className={`voting-card 
                                ${isSelected ? 'selected' : ''} 
                                ${isInteractionLocked ? 'locked' : ''}
                                ${isMe ? 'me' : ''}
                                ${isDead ? 'dead' : ''} 
                            `}
                            // --- MODIFICA 2: BLOCCA CLICK SE MORTO ---
                            onClick={() => !isDead && handleSelect(p.username)}
                            
                            // Colore cornice: se è morto usiamo un grigio, altrimenti il suo colore
                            style={{ 
                                borderColor: isSelected 
                                    ? '#ff4444' 
                                    : (isDead ? '#444' : (p.color || '#555')) 
                            }}
                        >
                            {/* CONTENITORE VIDEO */}
                            <div className="voting-video-container">
                                {streamToRender ? (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} 
                                    />
                                ) : (
                                    <div className="voting-fallback">
                                        {p.username.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                
                                {/* --- MODIFICA 3: MOSTRA X SE MORTO --- */}
                                {isDead && <div className="voting-dead-x">X</div>}

                                {/* OVERLAY INFO */}
                                <div className="voting-info-overlay">
                                    <span className="voting-name">
                                        {p.username} {isMe && "(Tu)"}
                                    </span>
                                    {hasVotedBadge && !isMe && <span className="voted-badge">Votato</span>}
                                </div>
                            </div>
                            
                            {/* ICONA TARGET (Solo se selezionato e vivo) */}
                            {isSelected && <div className="target-icon">🎯</div>}
                        </div>
                    );
                })}
            </div>

            {/* FOOTER AZIONI */}
            <div className="voting-footer">
                {!isInteractionLocked ? (
                    <>
                        <button 
                            className="btn-abstain"
                            onClick={() => submitVote(null)}
                        >
                            ASTIENITI
                        </button>

                        <button 
                            className="game-btn-action btn-confirm-vote"
                            disabled={!selectedPlayer}
                            onClick={() => submitVote(selectedPlayer)}
                        >
                            {selectedPlayer ? `ELIMINA ${selectedPlayer.toUpperCase()} 🔪` : "SELEZIONA"}
                        </button>
                    </>
                ) : (
                    <div className="waiting-others-msg">
                        In attesa degli altri voti...
                    </div>
                )}
            </div>
        </div>
    );
};

export default PhaseVoting;