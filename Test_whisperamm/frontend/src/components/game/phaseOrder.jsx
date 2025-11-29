import React from 'react';
import { useState, useEffect } from 'react';
import '../../style/phaseOrder.css'; // Creeremo questo file per tenere pulito

const PhaseOrder = ({ gameState, user, socket }) => {
    
    // 1. Ordiniamo i giocatori basandoci sul campo 'order' che arriva dal backend
    // Se 'order' non esiste, facciamo fallback sul valore dei dadi
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order; // Ordine crescente (1, 2, 3...)
        }
        return b.diceValue - a.diceValue; // Fallback decrescente
    });

    // --- LOGICA TIMER E AUTO-LANCIO ---
    const [timeLeft, setTimeLeft] = useState(15); 

    useEffect(() => {
        // Se il tempo arriva a 0, notifichiamo il backend
        if (timeLeft === 0) {
            console.log("⏰ Timer finito! Passaggio a PhaseWord...");
            if (socket) {
                socket.emit('OrderPhaseComplete'); // Notifica al backend
            }
            return;
        }

        const interval = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [timeLeft, socket]);    



    return (
        <div className="phase-order-container">
            <h2 className="phase-title">Il gioco sta per iniziare...</h2>
            <p className="phase-subtitle">L'ordine stabilito è il seguente</p>
            <p>Il round inizia tra </p>
                <div className={`phase-order-timer-display ${timeLeft <= 5 ? 'urgent' : ''}`}>
                    {timeLeft}s
                </div>            
            <div className="ranked-list">
                {sortedPlayers.map((p, index) => {
                    const isMe = p.username === user.username;
                    console.log(`Player: ${p.username}, Order: ${p.order}, DiceValue: ${p.diceValue}`);
                    return (
                        <div 
                            key={p.username} 
                            className={`ranked-card ${isMe ? 'me' : ''}`}
                            // Usiamo il colore del giocatore per il bordo e l'ombra
                            style={{ 
                                borderColor: p.color || '#ccc',
                                boxShadow: isMe ? `0 0 15px ${p.color}40` : 'none'
                            }}
                        >
                            {/* Posizione (1°, 2°, etc) */}
                            <div className="rank-badge" style={{ backgroundColor: p.color || '#444' }}>
                                #{index + 1}
                            </div>

                            {/* Avatar */}
                            <div className="player-avatar-large" style={{ backgroundColor: p.color || '#777' }}>
                                {p.username.charAt(0).toUpperCase()}
                            </div>

                            {/* Info Giocatore */}
                            <div className="player-info-large">
                                <span className="player-name-large">
                                    {p.username} {isMe && <span className="me-tag">(Tu)</span>}
                                </span>
                                <span className="roll-info">
                                    Ha totalizzato: <strong>{p.diceValue}</strong>
                                </span>
                            </div>

                            {/* Indicatore visivo (Freccia o status) */}
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