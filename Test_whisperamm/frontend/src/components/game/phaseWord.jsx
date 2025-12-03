import React, { useState, useEffect } from 'react';
import '../../style/phaseWord.css';

const PhaseWord = ({ gameState, user, socket }) => {
    
    // 1. RECUPERO DATI (Ora currentTurnIndex arriverà aggiornato!)
    const currentTurnIndex = gameState.currentTurnIndex || 0;
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentPlayer = sortedPlayers[currentTurnIndex];
    
    // 2. CONTROLLO TURNO
    // Importante: verifica che currentPlayer esista per evitare crash a fine gioco
    const isMyTurn = currentPlayer && currentPlayer.username === user.username;

    // 3. TIMER SINCRONIZZATO
    const [timeLeft, setTimeLeft] = useState(0);
    
    useEffect(() => {
        const endTime = gameState.endTime;
        if (!endTime) return;

        // Funzione aggiornamento
        const updateTimer = () => {
            const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(diff);
        };

        updateTimer(); // Esegui subito
        const interval = setInterval(updateTimer, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime]); // Si resetta quando arriva un nuovo endTime (quindi al cambio turno!)


    // 4. AZIONE CONFERMA
    const handleConfirmWord = () => {
        // Emit solo se è il mio turno e il socket c'è
        if (isMyTurn && socket) {
            console.log("📤 Invio conferma parola...");
            socket.emit('ConfirmWord');
            // Non facciamo nulla di grafico qui (es. disabilitare bottone),
            // aspettiamo che il server mandi il nuovo stato col nuovo index.
        }
    };

    return (
        <div className="phase-word-container">
            <div className="word-content-grid">
                
                {/* COLONNA SINISTRA */}
                <div className="word-turn-section">
                    <div className="turn-header">
                        <p className="turn-label">È IL TURNO DI</p>
                    </div>

                    {currentPlayer && (
                        <div className={`current-player-display ${isMyTurn ? 'my-turn-glow' : ''}`}>
                            <div 
                                className="player-avatar-huge"
                                style={{ backgroundColor: currentPlayer.color || '#777' }}
                            >
                                {currentPlayer.username.charAt(0).toUpperCase()}
                            </div>

                            <div className="player-turn-info">
                                <h2 className="current-player-name">
                                    {currentPlayer.username} {isMyTurn && "(Tu)"}
                                </h2>
                                
                                {isMyTurn ? (
                                    <p className="turn-instruction me">
                                        🎤 Dì la tua parola e conferma!
                                    </p>
                                ) : (
                                    <p className="turn-instruction">
                                        🤫 Ascolta attentamente...
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="word-actions">
                        <div className={`word-timer ${timeLeft <= 10 ? 'urgent' : ''}`}>
                            <span className="timer-value">{timeLeft}</span>
                            <span className="timer-unit">s</span>
                        </div>

                        {/* Bottone visibile SOLO se è il mio turno */}
                        {isMyTurn ? (
                            <button 
                                className="game-btn-action btn-confirm-word" 
                                onClick={handleConfirmWord}
                            >
                                HO DETTO LA PAROLA 👍
                            </button>
                        ) : (
                            <div className="wait-message">
                                In attesa di {currentPlayer?.username}...
                            </div>
                        )}
                    </div>
                </div>

                {/* COLONNA DESTRA (LISTA) */}
                <div className="word-players-section">
                    <h3 className="list-title">Sequenza</h3>
                    <div className="players-order-scroll">
                        {sortedPlayers.map((p, idx) => {
                            const isDone = idx < currentTurnIndex; // Già parlato
                            const isCurrent = idx === currentTurnIndex; // Sta parlando
                            const isMe = p.username === user.username;

                            return (
                                <div 
                                    key={p.username}
                                    className={`order-card ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                                    style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}
                                >
                                    <div className="order-info">
                                        <div className="order-number">#{idx + 1}</div>
                                        <div className="order-name">
                                            {p.username} {isMe && "(Tu)"}
                                        </div>
                                    </div>

                                    <div className="order-status-icon">
                                        {isDone && <span>✅</span>}
                                        {isCurrent && <span className="mic-icon">🎤</span>}
                                        {(!isDone && !isCurrent) && <span className="wait-dot">•</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PhaseWord;