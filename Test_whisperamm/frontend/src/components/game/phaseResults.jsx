import React, { useState, useEffect } from 'react';
import '../../style/phaseResults.css';

const PhaseResults = ({ gameState }) => {
    const { eliminated, role, message } = gameState.lastRoundResult || {};
    const [reveal, setReveal] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);

    // 1. Timer Sync (per mostrare quanto manca al prossimo round)
    useEffect(() => {
        const endTime = gameState.endTime;
        if (!endTime) return;

        const interval = setInterval(() => {
            const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(diff);
            if (diff <= 0) clearInterval(interval);
        }, 500);
        
        // Animazione Reveal dopo 2 secondi
        const revealTimer = setTimeout(() => setReveal(true), 2000);

        return () => {
            clearInterval(interval);
            clearTimeout(revealTimer);
        };
    }, [gameState.endTime]);

    // Logica colori/testi
    const isImpostor = role === 'IMPOSTOR';
    const roleText = isImpostor ? "ERA UN IMPOSTORE" : "ERA UN CIVILE";
    const roleClass = isImpostor ? "result-impostor" : "result-civilian";

    return (
        <div className="phase-results-container">
            
            {/* Header */}
            <div className="results-header">
                <h2 className="phase-title">Risultati Votazione</h2>
                <div className="timer-bar">
                    Prossimo round in {timeLeft}s
                </div>
            </div>

            <div className="results-content">
                {eliminated ? (
                    <div className="elimination-card">
                        <p className="elimination-text">Il villaggio ha deciso di eliminare...</p>
                        
                        <div className="victim-avatar">
                            {eliminated.charAt(0).toUpperCase()}
                        </div>
                        
                        <h1 className="victim-name">{eliminated}</h1>

                        {/* REVEAL BOX */}
                        <div className={`reveal-box ${reveal ? 'open' : ''}`}>
                            <div className="reveal-cover">
                                <span>???</span>
                            </div>
                            <div className={`reveal-content ${roleClass}`}>
                                <p>{roleText}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Caso Nessun Eliminato
                    <div className="no-elimination-card">
                        <div className="peace-icon">🕊️</div>
                        <h2>Nessun Eliminato</h2>
                        <p>{message || "I voti erano troppo dispersi o pari."}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PhaseResults;