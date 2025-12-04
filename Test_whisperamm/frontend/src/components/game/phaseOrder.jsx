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


    // ORDINAMENTO ROBUSTO (Con gestione Morti)
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => {
        // I vivi vanno sempre prima dei morti
        const aliveA = a.isAlive !== false;
        const aliveB = b.isAlive !== false;

        if (aliveA && !aliveB) return -1; // A vivo, B morto -> A sale
        if (!aliveA && aliveB) return 1;  // A morto, B vivo -> B sale

        // CRITERIO ORDINE (Se entrambi vivi o entrambi morti)
        const orderA = parseInt(a.order);
        const orderB = parseInt(b.order);

        if (!isNaN(orderA) && !isNaN(orderB)) {
            // Se l'ordine è 0 (spesso usato per i morti nel backend), lo trattiamo come ultimo
            if (orderA === 0) return 1;
            if (orderB === 0) return -1;
            return orderA - orderB;
        }

        // CRITERIO DADI (Fallback)
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
                    const isDead = p.isAlive === false; // Check morte
                    
                    const totalValue = p.diceValue ?? ((p.dice1 || 0) + (p.dice2 || 0));
                    
                    // Se è morto non ha un ordine valido, non mostriamo il numero o mostriamo un simbolo
                    const displayOrder = isDead ? '-' : (p.order || index + 1);

                    return (
                        <div 
                            key={p.username} 
                            // AGGIUNTA CLASSE 'dead' SE MORTO
                            className={`ranked-card ${isMe ? 'me' : ''} ${isDead ? 'dead' : ''}`}
                            style={{ 
                                borderColor: isDead ? '#444' : (p.color || '#ccc'),
                                boxShadow: isMe ? `0 0 15px ${p.color}40` : 'none',
                                opacity: isDead ? 0.6 : 1 // Opacità visiva inline per sicurezza
                            }}
                        >
                            {/* Badge Posizione */}
                            <div className="rank-badge" style={{ backgroundColor: isDead ? '#222' : (p.color || '#444') }}>
                                {isDead ? '💀' : `#${displayOrder}`}
                            </div>

                            {/* Avatar */}
                            <div className="player-avatar-large" style={{ backgroundColor: isDead ? '#333' : (p.color || '#777') }}>
                                {p.username.charAt(0).toUpperCase()}
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

                            {/* Indicatore visivo (Corona solo se vivo e primo) */}
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