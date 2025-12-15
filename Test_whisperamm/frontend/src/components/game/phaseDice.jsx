// src/components/game/PhaseDice.jsx
import React, { useState, useEffect } from 'react'; 
import { useSocket } from '../../context/SocketProvider';
import DiceArena from './subgame/DiceArena'; 
import RollingDiceIcon from './subgame/RollingDiceIcon'; 
import VideoPlayer from '../VideoPlayer'; 
import '../../style/PhaseDice.css';

const PhaseDice = ({ gameState, user, localStream, remoteStreams }) => {
    
    // --- 1. SETUP STATI E SOCKET ---
    const { socket } = useSocket();
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false);
    const [localResults, setLocalResults] = useState({}); // { username: { diceValue: 5, hasRolled: true } }
    
    // --- 2. LOGICA TIMER ---
    const calculateTimeLeft = () => {
        if (!gameState.endTime) return null; 
        return Math.max(0, Math.floor((gameState.endTime - Date.now()) / 1000));
    };
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft()); 

    useEffect(() => {
        const interval = setInterval(() => {
            const t = calculateTimeLeft();
            setTimeLeft(t);
            if (t !== null && t <= 0) {
                clearInterval(interval);
                if (!mergedMyPlayer?.hasRolled && !isWaiting) handleDiceRoll();
            }
        }, 500);
        return () => clearInterval(interval);
    }, [gameState.endTime, isWaiting]); // Nota: activeRolls/localResults non servono qui

    // --- 3. SOCKET LISTENERS ---
    useEffect(() => {
        if (!socket) return;
        const handlePlayerRolled = (payload) => {
            const pColor = payload.color || gameState.players?.find(p => p.username === payload.username)?.color || '#fff';
            setActiveRolls(prev => [...prev, { ...payload, id: Date.now() + Math.random(), color: pColor }]);
        };
        socket.on('playerRolledDice', handlePlayerRolled);
        return () => socket.off('playerRolledDice', handlePlayerRolled);
    }, [socket, gameState.players]);

    // --- 4. ACTIONS & HELPERS ---
    const handleDiceRoll = () => { 
        if(isWaiting) return; 
        setIsWaiting(true);
        if(socket) socket.emit('DiceRoll'); 
    };

    const onRollComplete = (id, username, total) => {
        if (username === user.username) setIsWaiting(false);
        setLocalResults(prev => ({ ...prev, [username]: { hasRolled: true, diceValue: total } }));
    };

    // Unione dati server + dati animazione locale
    const mergedPlayers = gameState.players?.map(p => ({ ...p, ...(localResults[p.username] || {}) })) || [];
    const mergedMyPlayer = mergedPlayers.find(p => p.username === user.username);
    const amIReady = mergedMyPlayer?.hasRolled;

    return (
        <>
            {/* TIMER */}
            {!amIReady && (
                <div className="dice-phase-timer">
                    <p>Tempo Rimanente</p>
                    <div className={`timer-display ${timeLeft <= 5 ? 'urgent' : ''}`}>
                        {timeLeft !== null ? `${timeLeft}s` : '...'}
                    </div>
                </div>
            )}
            
            <div className="game-content-row">
                {/* AREA DADI 3D */}
                <div className="game-table-area">
                    <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                        <DiceArena activeRolls={activeRolls} onRollComplete={onRollComplete} />
                    </div>
                </div>

                {/* SIDEBAR COMPATTA */}
                <aside className="game-sidebar">
                    <h2 className="sidebar-title">Lancio Dadi</h2>
                    <div className="sidebar-players">
                        {mergedPlayers.map((p) => {
                            const isMe = p.username === user.username;
                            const remote = remoteStreams?.find(r => r.display === p.username);
                            const streamToRender = isMe ? localStream : remote?.stream;

                            return (
                                <div key={p.username} className={`sidebar-player ${isMe ? 'me' : ''}`} style={{ borderLeft: `4px solid ${p.color || '#ccc'}` }}>
                                    
                                    <div className="player-row-left">
                                        {/* AVATAR / VIDEO */}
                                        <div className="sidebar-player-avatar" style={{ backgroundColor: p.color || '#d249ff' }}>
                                            {streamToRender ? (
                                                <VideoPlayer stream={streamToRender} isLocal={isMe} audioOnly={true} /> 
                                            ) : (
                                                p.username[0].toUpperCase()
                                            )}
                                            {/* Pallino Audio attivo (opzionale) */}
                                            {streamToRender && <div className="audio-dot" />} 
                                        </div>

                                        <span className="sidebar-player-name">
                                            {p.username} {isMe && '(Tu)'}
                                        </span>
                                    </div>

                                    {/* STATO LANCIO */}
                                    <div className="sidebar-roll-status">
                                        {p.hasRolled ? (
                                            <div className="status-done">
                                                <span className="dice-value-small">{p.diceValue}</span>
                                                <span className="check-icon">✅</span>
                                            </div>
                                        ) : (
                                            <div className="status-waiting"><RollingDiceIcon /></div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            </div>

            {/* FOOTER ACTIONS */}
            <div className="game-footer">
                <div className="game-buttons">
                    {!amIReady ? (
                        <button 
                            className="game-btn-action" 
                            onClick={handleDiceRoll}
                            disabled={isWaiting}
                            style={{ opacity: isWaiting ? 0.6 : 1 }}
                        >
                            {isWaiting ? "Lancio..." : "🎲 LANCIA I DADI"}
                        </button>
                    ) : (
                        <p className="status-text">Hai già lanciato. Attendi gli altri...</p>
                    )}
                </div>
            </div>
        </>
    );
};

export default PhaseDice;