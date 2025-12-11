// src/components/game/PhaseWord.jsx
import React, { useState, useEffect } from 'react';
import '../../style/phaseWord.css';
import VideoPlayer from '../VideoPlayer'; // <--- IMPORTA IL PLAYER

const PhaseWord = ({ 
    gameState, 
    user, 
    socket,
    localStream,    // <--- Props ricevute
    remoteStreams,
    toggleAudio //Funzione aggiunta oggi
}) => {
    
    // 1. RECUPERO DATI
    const currentTurnIndex = gameState.currentTurnIndex || 0;
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentPlayer = sortedPlayers[currentTurnIndex];
    
    // 2. CONTROLLO TURNO
    const isMyTurn = currentPlayer && currentPlayer.username === user.username;

    // --- 3. EFFETTO PER GESTIRE L'AUDIO AUTOMATICO ---
    useEffect(() => {
        // Se è il mio turno -> Audio ON (true)
        // Se NON è il mio turno -> Audio OFF (false)
            toggleAudio(isMyTurn);

        // Cleanup: quando cambia fase o smonto, muto per sicurezza
        return () => {
            if (toggleAudio) toggleAudio(false);
        };
    }, [isMyTurn, toggleAudio]);

    // --- LOGICA STREAM CORRENTE (AVATAR GIGANTE) ---
    // Determiniamo lo stream del giocatore attivo
    const activeStream = isMyTurn 
        ? localStream 
        : (remoteStreams ? remoteStreams.find(r => r.display === currentPlayer?.username)?.stream : null);

    // 3. TIMER SINCRONIZZATO
    const [timeLeft, setTimeLeft] = useState(0);
    
    useEffect(() => {
        const endTime = gameState.endTime;
        if (!endTime) return;

        const updateTimer = () => {
            const diff = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTimeLeft(diff);
        };

        updateTimer(); 
        const interval = setInterval(updateTimer, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime]);


    // 4. AZIONE CONFERMA
    const handleConfirmWord = () => {
        if (isMyTurn && socket) {
            console.log("📤 Invio conferma parola...");
            socket.emit('ConfirmWord');
        }
    };

    return (
        <div className="phase-word-container">
            <div className="word-content-grid">
                
                {/* COLONNA SINISTRA (FOCUS GIOCATORE ATTIVO) */}
                <div className="word-turn-section">
                    <div className="turn-header">
                        <p className="turn-label">È IL TURNO DI</p>
                    </div>

                    {currentPlayer && (
                        <div className={`current-player-display ${isMyTurn ? 'my-turn-glow' : ''}`}>
                            
                            {/* --- AVATAR GIGANTE CON VIDEO --- */}
                            <div 
                                className="player-avatar-huge"
                                style={{ 
                                    backgroundColor: currentPlayer.color || '#777',
                                    position: 'relative',
                                    overflow: 'hidden' // Importante per tagliare il video a cerchio
                                }}
                            >
                                {/* 1. Mostra sempre l'iniziale sotto (come fallback) */}
                                {!activeStream && currentPlayer.username.charAt(0).toUpperCase()}

                                {/* 2. Se c'è lo stream, mostra il VIDEO FULL */}
                                {activeStream && (
                                    <VideoPlayer 
                                        stream={activeStream} 
                                        isLocal={isMyTurn} 
                                        display={currentPlayer.username}
                                        audioOnly={false} // Qui vogliamo il VIDEO!
                                    />
                                )}
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

                {/* COLONNA DESTRA (LISTA SEQUENZA + AUDIO BACKGROUND) */}
                <div className="word-players-section">
                    <h3 className="list-title">Sequenza</h3>
                    <div className="players-order-scroll">
                        {sortedPlayers.map((p, idx) => {
                            const isDone = idx < currentTurnIndex; 
                            const isCurrent = idx === currentTurnIndex; 
                            const isMe = p.username === user.username;

                            // LOGICA AUDIO BACKGROUND:
                            // Vogliamo sentire anche quelli che NON sono di turno (risate, commenti)
                            // Ma non vogliamo visualizzare il loro video, solo audio invisibile.
                            // Nota: Il giocatore corrente è già gestito nell'avatar gigante, quindi qui non serve (o serve doppio se vuoi essere sicuro)
                            
                            const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                            const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                            // Renderizziamo l'audio player QUI se NON è il giocatore corrente
                            // (Il corrente ha già il video grande a sinistra che gestisce l'audio)
                            const shouldRenderAudioOnly = streamToRender && !isCurrent;

                            return (
                                <div 
                                    key={p.username}
                                    className={`order-card ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                                    style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}
                                >
                                    {/* PLAYER AUDIO INVISIBILE PER BACKGROUND */}
                                    {shouldRenderAudioOnly && (
                                        <div style={{position: 'absolute', width: 0, height: 0}}>
                                            <VideoPlayer 
                                                stream={streamToRender} 
                                                isLocal={isMe} 
                                                audioOnly={true} // Invisibile
                                            />
                                        </div>
                                    )}

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
                                        
                                        {/* Piccolo indicatore verde se l'audio è presente (opzionale) */}
                                        {shouldRenderAudioOnly && (
                                            <span style={{
                                                display: 'inline-block', 
                                                width: '6px', 
                                                height: '6px', 
                                                background: '#2ecc71', 
                                                borderRadius: '50%', 
                                                marginLeft: '5px'
                                            }}/>
                                        )}
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