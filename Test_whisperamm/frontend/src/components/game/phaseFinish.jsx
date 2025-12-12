import React, { useEffect } from 'react';
import '../../style/phaseFinish.css';
import VideoPlayer from '../VideoPlayer'; 

const PhaseFinish = ({ 
    gameState, 
    user, 
    onLeave,
    localStream,    
    remoteStreams,
    toggleAudio     
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
                subtitle: "Tempo scaduto.",
                emoji: "⏳"
            };
        }
        return {
            title: "GLI IMPOSTORI HANNO VINTO",
            subtitle: "Sabotaggio riuscito.",
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
                    
                    // Controlliamo se è vivo
                    const isDead = !p.isAlive;
                    
                    const remote = remoteStreams ? remoteStreams.find(r => r.display === p.username) : null;
                    const streamToRender = isMe ? localStream : (remote ? remote.stream : null);

                    return (
                        <div 
                            key={p.username} 
                            className={`
                                finish-card 
                                ${isMe ? 'me' : ''} 
                                ${isPImpostor ? 'is-impostor' : 'is-civilian'}
                                ${isDead ? 'is-dead' : ''} 
                            `}
                        >
                            {/* 1. CONTENITORE VIDEO (DENTRO LA CORNICE) */}
                            <div className="finish-video-container" style={{ backgroundColor: p.color || '#333' }}>
                                {streamToRender ? (
                                    <VideoPlayer 
                                        stream={streamToRender} 
                                        isLocal={isMe} 
                                        display={p.username}
                                        audioOnly={false} 
                                    />
                                ) : (
                                    <div className="finish-fallback">
                                        {p.username.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {/* 2. OVERLAY MORTO (LA X) */}
                            {isDead && (
                                <div className="dead-overlay-x">X</div>
                            )}
                            
                            {/* 3. INFO OVERLAY */}
                            <div className="finish-info-overlay">
                                <div className="finish-name">
                                    {p.username} {isMe && "(Tu)"}
                                </div>
                                
                                <div className="finish-details">
                                    <span className="finish-role">
                                        {isPImpostor ? "Impostore" : "Civile"}
                                    </span>
                                    <span className="finish-status-badge">
                                        {isDead ? "MORTO" : "VIVO"}
                                    </span>
                                </div>
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