import React, { useState, useEffect } from 'react';
import '../../style/phaseVoting.css';

const PhaseVoting = ({ gameState, user, socket }) => {
    const [timeLeft, setTimeLeft] = useState(30); // 30 secondi per votare
    const [selectedPlayer, setSelectedPlayer] = useState(null); // Chi ho cliccato
    const [hasVoted, setHasVoted] = useState(false); // Ho già confermato?
    
    // Filtriamo solo i giocatori vivi (gli unici che possono essere votati)
    const alivePlayers = gameState.players?.filter(p => p.isAlive) || [];
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIAlive = myPlayer?.isAlive;

    // Timer Locale
    useEffect(() => {
        if (timeLeft === 0) {
            // Se il tempo scade e non ho votato, mando uno skip automatico o nulla
            if (!hasVoted && amIAlive && socket) {
                handleConfirmVote(null); // Null = Skip o astenuto
            }
            return;
        }
        const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
        return () => clearInterval(interval);
    }, [timeLeft, hasVoted, amIAlive, socket]);

    // Gestione Click su un giocatore
    const handleSelect = (username) => {
        if (hasVoted || !amIAlive) return;
        // Se clicco quello già selezionato, deseleziono (modalità skip implicita)
        if (selectedPlayer === username) {
            setSelectedPlayer(null);
        } else {
            setSelectedPlayer(username);
        }
    };

    // Invio del voto al server
    const handleConfirmVote = (targetUsername) => {
        if (hasVoted) return;
        
        console.log(`🗳️ Voto inviato per: ${targetUsername || "SKIP"}`);
        
        if (socket) {
            // Emetti l'evento al server
            socket.emit('submitVote', { 
                roomId: gameState.roomId, 
                voteFor: targetUsername // Se null è skip
            });
        }
        setHasVoted(true);
    };

    return (
        <div className="phase-voting-container">
            <header className="voting-header">
                <h2 className="phase-title">
                    {hasVoted ? "Voto Registrato" : "Chi è l'Impostore?"}
                </h2>
                <div className={`timer-display ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    {timeLeft}s
                </div>
            </header>

            {!amIAlive && (
                <div className="dead-banner">
                    👻 Sei morto. Non puoi votare, ma goditi lo spettacolo.
                </div>
            )}

            <div className="voting-grid">
                {alivePlayers.map((p) => {
                    const isSelected = selectedPlayer === p.username;
                    const isMe = p.username === user.username;

                    return (
                        <div 
                            key={p.username}
                            onClick={() => handleSelect(p.username)}
                            className={`voting-card 
                                ${isSelected ? 'selected' : ''} 
                                ${hasVoted ? 'disabled' : ''}
                                ${isMe ? 'me' : ''}
                            `}
                            style={{ 
                                borderColor: isSelected ? '#fff' : (p.color || '#444'),
                                boxShadow: isSelected ? `0 0 20px ${p.color}` : 'none'
                            }}
                        >
                            <div className="player-avatar-large" style={{ backgroundColor: p.color || '#777' }}>
                                {p.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="player-name-voting">
                                {p.username} {isMe && "(Tu)"}
                            </div>
                            {/* Se vuoi mostrare che l'hai selezionato visivamente con un'icona */}
                            {isSelected && <div className="vote-target-icon">🎯</div>}
                        </div>
                    );
                })}
            </div>

            {/* FOOTER AZIONI (Visibile solo se sono vivo e non ho votato) */}
            {amIAlive && !hasVoted && (
                <div className="voting-actions">
                    <button 
                        className="btn-skip"
                        onClick={() => handleConfirmVote(null)}
                    >
                        Saltare il voto 🤷
                    </button>

                    <button 
                        className="btn-confirm-vote"
                        onClick={() => handleConfirmVote(selectedPlayer)}
                        disabled={!selectedPlayer} // Disabilita se non ho selezionato nessuno
                    >
                        Vota {selectedPlayer || ""} 🔪
                    </button>
                </div>
            )}

            {hasVoted && (
                <p className="status-text">In attesa degli altri giocatori...</p>
            )}
        </div>
    );
};

export default PhaseVoting;