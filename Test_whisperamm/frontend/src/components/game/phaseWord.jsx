import React, { useState, useEffect } from 'react';
import '../../style/phaseWord.css';

const PhaseWord = ({ gameState, user, socket }) => {
    const [timeLeft, setTimeLeft] = useState(30);
    const [currentTurnIndex, setCurrentTurnIndex] = useState(0);

    // Otteniamo il giocatore che deve dire la parola
    const sortedPlayers = [...gameState.players].sort((a, b) => a.order - b.order);
    const currentPlayer = sortedPlayers[currentTurnIndex];
    const isMyTurn = currentPlayer?.username === user.username;

    const handleConfirmWord = () => {
        if (isMyTurn) {
            socket.emit('ConfirmWord');
            console.log("Hai confermato la parola detta.");
        }
    };

    // Timer countdown
    useEffect(() => {
        if (timeLeft === 0) {
            // Passa al prossimo turno
            if (currentTurnIndex < gameState.players.length - 1) {
                setCurrentTurnIndex(prev => prev + 1);
                setTimeLeft(30);
            }
            return;
        }

        const interval = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [timeLeft, currentTurnIndex, gameState.players?.length]);

    //ascolta quando un giocatore conferma la parola
    useEffect(() => {
        socket.on('playerSpoken', (data) => {
            console.log(`Il giocatore ${data.username} ha detto la parola.`);
            // Passa al prossimo turno
            if (currentTurnIndex < sortedPlayers.length - 1) {
                setCurrentTurnIndex(prev => prev + 1);
                setTimeLeft(30);
            }
        });

        return () => {
            socket.off('playerSpoken');
        };
    }, [currentTurnIndex, sortedPlayers.length, socket]);

    // Auto-conferma dopo 30 secondi
    useEffect(() => {
        if (timeLeft === 0 && isMyTurn) {
            console.log("⏰ Tempo scaduto! Conferma automatica...");
            handleConfirmWord();
        }
    }, [timeLeft, isMyTurn]);

    return (
        <div className="phase-word-container">
            <div className="word-content-grid">
                {/* COLONNA SINISTRA - AREA TURNO */}
                <div className="word-turn-section">
                    <div className="turn-header">
                        <p className="turn-label">È il turno di...</p>
                    </div>

                    <div className="current-player-display">
                        <div 
                            className={`player-avatar-huge ${isMyTurn ? 'highlight' : ''}`}
                            style={{ backgroundColor: currentPlayer?.color || '#777' }}
                        >
                            {currentPlayer?.username?.charAt(0).toUpperCase()}
                        </div>

                        <div className="player-turn-info">
                            <h2 className="current-player-name">
                                {currentPlayer?.username}
                            </h2>
                            {isMyTurn && (
                                <p className="turn-indicator-me">🎤 Dì la parola a voce!</p>
                            )}
                            <p className="turn-status">
                                {isMyTurn ? "Toccherà a te tra breve" : "In attesa..."}
                            </p>
                        </div>
                    </div>

                    {/* TIMER E BOTTONE CONFERMA */}
                    <div className="word-actions">
                        <div className={`word-timer ${timeLeft <= 5 ? 'urgent' : ''}`}>
                            <span className="timer-label">Tempo:</span>
                            <span className="timer-value">{timeLeft}s</span>
                        </div>
                        {isMyTurn && (
                            <button 
                                className="game-btn-action" 
                                onClick={handleConfirmWord}
                            >
                                Conferma
                            </button>
                        )}
                    </div>
                </div>

                {/* COLONNA DESTRA - LISTA GIOCATORI */}
                <div className="word-players-section">
                    <h3 className="list-title">Ordine dei turni</h3>
                    <div className="players-order">
                        {sortedPlayers?.map((p, idx) => {
                            const isDone = idx < currentTurnIndex;
                            const isCurrent = idx === currentTurnIndex;
                            const isNext = idx === currentTurnIndex + 1;

                            return (
                                <div 
                                    key={p.username}
                                    className={`order-card ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                                    style={{ borderColor: p.color || '#ccc' }}
                                >
                                    <div className="order-number">{idx + 1}</div>
                                    <div className="order-avatar" style={{ backgroundColor: p.color || '#777' }}>
                                        {p.username?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="order-name">{p.username}</div>
                                    {isDone && <div className="order-status">✅</div>}
                                    {isCurrent && <div className="order-status">🎤</div>}
                                    {isNext && <div className="order-status">⏭️</div>}
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