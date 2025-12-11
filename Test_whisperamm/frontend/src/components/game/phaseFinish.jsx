// src/components/game/phaseFinish.jsx
import React, { useEffect } from 'react'; // Aggiungi useEffect
import '../../style/phaseFinish.css';
import VideoPlayer from '../VideoPlayer'; // <--- IMPORTA IL PLAYER

const PhaseFinish = ({ 
    gameState, 
    user, 
    onLeave,
    localStream,    // <--- RICEVI GLI STREAM
    remoteStreams,
    toggleAudio     // <--- RICEVI IL CONTROLLO AUDIO
}) => {
    const winner = gameState.winner;
    const cause = gameState.cause; 
    
    const isImpostorWin = winner === 'IMPOSTORS';
    const themeClass = isImpostorWin ? "theme-impostor" : "theme-civilian";

    // --- ATTIVAZIONE AUDIO FINALE ---
    // Vogliamo che alla fine tutti possano parlarsi (es. "Ah eri tu!")
    useEffect(() => {
        if (toggleAudio) {
            console.log("🏁 Fine Partita: Audio ON per tutti");
            toggleAudio(true);
        }
    }, [toggleAudio]);

    const getTextContent = () => {
        if (winner === 'CIVILIANS') {
            return {
                title: "I CIVILI HANNO VINTO!",
                subtitle: "L'impostore è stato eliminato.",
                emoji: "🎉"
            };
        } 
        if (cause === 'roundsExceeded') {
            return {
                title: "GLI IMPOSTORI VINCONO",
                subtitle: "Tempo scaduto: i civili non hanno trovato il colpevole.",
                emoji: "⏳"
            };
        }
        return {
            title: "GLI IMPOSTORI HANNO VINTO",
            subtitle: "I civili sono stati eliminati.",
            emoji: "🔪"
        };
    };

    const content = getTextContent();

    return (
        <div className={`phase-finish-container ${themeClass}`}>
            
            <div className="finish-header">
                <div className="winner-icon">{content.emoji}</div>
                <h1 className="winner-title">{content.title}</h1>
                <p className="winner-subtitle">{content.subtitle}</p>
            </div>

            <div className="finish-players-grid">
                {gameState.players?.map((p) => {
                    const isMe = p.username === user.username;
                    const pRole = p.role || 'CIVILIAN'; 
                    const isPImpostor = pRole === 'IMPOSTOR';
                    
                    // --- LOGICA STREAM VIDEO ---
                    // Cerchiamo lo stream video del giocatore
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={p.username} 
                            className={`finish-card ${isMe ? 'me' : ''} ${isPImpostor ? 'is-impostor' : 'is-civilian'}`}
                        >
                            {/* AVATAR + VIDEO PLAYER */}
                            <div 
                                className="player-avatar-large" 
                                style={{ 
                                    backgroundColor: p.color || '#777',
                                    position: 'relative',
                                    overflow: 'hidden' // Importante per il video
                                }}
                            >
                                {/* Fallback Iniziale */}
                                {!streamToRender && p.username.charAt(0).toUpperCase()}

                                {/* VIDEO LIVE */}
                                {streamToRender && (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} // <--- VOGLIAMO IL VIDEO!
                                    />
                                )}
                            </div>
                            
                            <div className="finish-info">
                                <div className="finish-name">
                                    {p.username} {isMe && "(Tu)"}
                                </div>
                                <div className="finish-role">
                                    {isPImpostor ? "IMPOSTORE" : "CIVILE"}
                                </div>
                            </div>

                            <div className="finish-status">
                                {p.isAlive ? "🏆 Vivo" : "💀 Morto"}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="finish-footer">
                <button className="game-btn-action btn-home" onClick={onLeave}>
                    TORNA ALLA HOME 🏠
                </button>
            </div>
        </div>
    );
};

export default PhaseFinish;