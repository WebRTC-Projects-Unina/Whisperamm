import React, { useState, useEffect } from 'react'; 
import '../../style/phaseOrder.css'; 

const PhaseOrder = ({ gameState, user }) => {
    
    // --- 1. LOGICA TIMER CON FIX DELLO "0" INIZIALE ---
    
    // Funzione helper per calcolare il tempo attuale
    const calculateTimeLeft = () => {
        const endTime = gameState.endTime;
        if (!endTime) return null; // Ritorniamo null se non c'è ancora data
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((endTime - now) / 1000));
        return diff;
    };

    // Inizializziamo lo stato con il valore GIÀ CALCOLATO
    // Così al primo render mostra "15" e non "0"
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        // Aggiorniamo subito nel caso endTime cambi
        setTimeLeft(calculateTimeLeft());

        const interval = setInterval(() => {
            const seconds = calculateTimeLeft();
            setTimeLeft(seconds);
            if (seconds !== null && seconds <= 0) clearInterval(interval);
        }, 500);

        return () => clearInterval(interval);
    }, [gameState.endTime]);


    // --- 2. ORDINAMENTO GIOCATORI ---
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => {
        const orderA = parseInt(a.order);
        const orderB = parseInt(b.order);

        if (!isNaN(orderA) && !isNaN(orderB)) {
            return orderA - orderB;
        }
        // Fallback
        const valA = a.diceValue ?? ((a.dice1 || 0) + (a.dice2 || 0));
        const valB = b.diceValue ?? ((b.dice1 || 0) + (b.dice2 || 0));
        return valB - valA; 
    });

    return (
        <div className="phase-order-container">
            
            {/* --- NUOVA SEZIONE TIMER STILIZZATA --- */}
            <div className="phase-timer-wrapper">
                <p className="timer-label">Il round inizia tra</p>
                
                <div className={`timer-display-large ${timeLeft !== null && timeLeft <= 5 ? 'urgent' : ''}`}>
                    {/* Se è null (caricamento) mostra ..., altrimenti il numero */}
                    {timeLeft !== null ? `${timeLeft}s` : '...'}
                </div>            
            </div>

            <h2 className="phase-title">Ordine di Gioco</h2>
            
            <div className="ranked-list">
                {sortedPlayers.map((p, index) => {
                    const isMe = p.username === user.username;
                    const totalValue = p.diceValue ?? ((p.dice1 || 0) + (p.dice2 || 0));
                    const displayOrder = p.order || index + 1;

                    return (
                        <div 
                            key={p.username} 
                            className={`ranked-card ${isMe ? 'me' : ''}`}
                            style={{ 
                                borderColor: p.color || '#ccc',
                                boxShadow: isMe ? `0 0 15px ${p.color}40` : 'none'
                            }}
                        >
                            <div className="rank-badge" style={{ backgroundColor: p.color || '#444' }}>
                                #{displayOrder}
                            </div>

                            <div className="player-avatar-large" style={{ backgroundColor: p.color || '#777' }}>
                                {p.username.charAt(0).toUpperCase()}
                            </div>

                            <div className="player-info-large">
                                <span className="player-name-large">
                                    {p.username} {isMe && <span className="me-tag">(Tu)</span>}
                                </span>
                                <span className="roll-info">
                                    Totale Dadi: <strong>{totalValue}</strong>
                                </span>
                            </div>

                            <div className="turn-indicator">
                                {index === 0 && <span>👑 Inizia</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PhaseOrder;