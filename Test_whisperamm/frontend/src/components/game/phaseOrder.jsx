import React, { use } from 'react'; 
import { useState, useEffect, useRef } from 'react';
import '../../style/phaseOrder.css'; // Creeremo questo file per tenere pulito

const PhaseOrder = ({ gameState, user, socket }) => {
    
    const [sortedPlayers, setSortedPlayers] = useState([]);
    // --- LOGICA TIMER E AUTO-LANCIO ---
    const [timeLeft, setTimeLeft] = useState(10); 
    const hasEmitted = useRef(false);   
    // Ordiniamo i players al mount
    useEffect(() => {
        if (socket && !hasEmitted.current) {
            console.log("📤 Emetto 'OrderPlayers' al backend...");
            socket.emit('OrderPlayers');
            hasEmitted.current = true;
        }
    }, [socket]);

    // Ascolta il backend per l'ordine aggiornato
    useEffect(() => {
        if (!socket) return;

        socket.on('playersOrdered', (payload) => {
            console.log("📥 Ricevuti giocatori ordinati:", payload);
            setSortedPlayers(payload.players || []);
        });

        return () => {
            socket.off('playersOrdered');
        };
    }, [socket]);


    useEffect(() => {
        // Se il tempo arriva a 0, notifichiamo il backend
        if (timeLeft === 0) {
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