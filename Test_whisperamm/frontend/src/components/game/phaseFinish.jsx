import React, { useEffect } from 'react';
import '../../style/phaseFinish.css';
import VideoPlayer from '../VideoPlayer'; // <--- Assicurati che l'import sia corretto

const PhaseFinish = ({ 
    gameState, 
    user, 
    onLeave,
    localStream,    // <--- Props necessarie per il video
    remoteStreams,
    toggleAudio     // <--- Props per attivare il microfono
}) => {
    const winner = gameState.winner;
    const cause = gameState.cause;   
    
    const isImpostorWin = winner === 'IMPOSTORS';
    const themeClass = isImpostorWin ? "theme-impostor" : "theme-civilian";

    // --- AUDIO ON: Alla fine della partita ci si sente tutti ---
    useEffect(() => {
        if (toggleAudio) {
            console.log("🏁 Fine Partita: Audio ON");
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
                subtitle: "Tempo scaduto (Round esauriti).",
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
                    
                    // 1. Trova lo stream video corretto
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={p.username} 
                            className={`finish-card ${isMe ? 'me' : ''} ${isPImpostor ? 'is-impostor' : 'is-civilian'}`}
                        >
                            {/* 2. AVATAR / VIDEO GIGANTE */}
                            <div 
                                className="player-avatar-large-finish" 
                                style={{ 
                                    backgroundColor: p.color || '#777',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Fallback Iniziale (Lettera) */}
                                {!streamToRender && p.username.charAt(0).toUpperCase()}

                                {/* VIDEO PLAYER REALE */}
                                {streamToRender && (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} // Mostra il video!
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