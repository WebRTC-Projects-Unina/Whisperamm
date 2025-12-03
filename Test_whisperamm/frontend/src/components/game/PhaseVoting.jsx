import React, { useState, useEffect } from 'react';
import '../../style/phaseVoting.css';

const PhaseVoting = ({ gameState, user, socket }) => {
    
    // --- 1. LOGICA TIMER SINCRONIZZATA ---
    const calculateTimeLeft = () => {
        const endTime = gameState.endTime;
        if (!endTime) return 0;
        const now = Date.now();
        return Math.max(0, Math.ceil((endTime - now) / 1000));
    };

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [selectedPlayer, setSelectedPlayer] = useState(null); // Username del target
    const [hasConfirmed, setHasConfirmed] = useState(false);    // UI Lock dopo invio

    // Recuperiamo info utili
    const alivePlayers = gameState.players?.filter(p => p.isAlive) || [];
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIAlive = myPlayer?.isAlive;
    // Se nel gameState c'è traccia che ho già votato (recupero crash/refresh)
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
        // Non puoi selezionare se: sei morto, hai già votato, o il tempo è finito
        if (!amIAlive || hasConfirmed || serverSaysIVoted || timeLeft <= 0) return;
        
        // Toggle selezione
        if (selectedPlayer === targetUsername) {
            setSelectedPlayer(null);
        } else {
            setSelectedPlayer(targetUsername);
        }
    };

    const submitVote = (target) => {
        if (!socket) return;
        
        console.log(`📤 Invio voto per: ${target || "ASTENSIONE"}`);
        
        // Emit al server
        socket.emit('Vote', { voteFor: target }); // target è null per astensione
        
        // Blocco UI locale istantaneo
        setHasConfirmed(true);
        setSelectedPlayer(null);
    };

    // Blocco totale se ho già votato (visivamente)
    const isInteractionLocked = !amIAlive || hasConfirmed || serverSaysIVoted || timeLeft <= 0;

    return (
        <div className="phase-voting-container">
            
            {/* HEADER */}
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
                    // Se il server ci dice che questo player ha votato, mostriamo un'icona (opzionale)
                    const hasVotedBadge = p.hasVoted; 

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
                            {/* Avatar */}
                            <div className="player-avatar-large" style={{ backgroundColor: p.color || '#777' }}>
                                {p.username.charAt(0).toUpperCase()}
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

            {/* FOOTER AZIONI (Solo per vivi che devono ancora votare) */}
            {!isInteractionLocked && (
                <div className="voting-footer">
                    {/* Tasto Astensione (Sempre attivo) */}
                    <button 
                        className="btn-abstain"
                        onClick={() => submitVote(null)}
                    >
                        🤷 ASTIENITI
                    </button>

                    {/* Tasto Vota (Attivo solo se selezionato) */}
                    <button 
                        className="game-btn-action btn-confirm-vote"
                        disabled={!selectedPlayer}
                        onClick={() => submitVote(selectedPlayer)}
                        style={{ 
                            opacity: selectedPlayer ? 1 : 0.5,
                            cursor: selectedPlayer ? 'pointer' : 'not-allowed'
                        }}
                    >
                        {selectedPlayer ? `VOTA ${selectedPlayer.toUpperCase()} 🔪` : "SELEZIONA UN GIOCATORE"}
                    </button>
                </div>
            )}

            {/* Messaggio di attesa post-voto */}
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