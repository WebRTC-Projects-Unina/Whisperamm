// src/components/Game.jsx
import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import { JanusContext } from '../context/JanusProvider'; 

import PhaseDice from './game/phaseDice';
import PhaseOrder from './game/phaseOrder';
import PhaseWord from './game/phaseWord';
import PhaseDiscussion from './game/phaseDiscussion';
import PhaseVoting from './game/phaseVoting';
import PhaseResults from './game/phaseResults';
import PhaseFinish from './game/phaseFinish';
import '../style/Game.css';
import '../style/Lobby.css';

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    const { socket, disconnectSocket } = useSocket(); 
    
    // --- JANUS INTEGRATION ---
    const { 
        initializeJanus, 
        joinRoom, 
        isJanusReady, 
        status: janusStatus,
        cleanup: cleanupJanus,
        localStream,   
        remoteStreams,
        toggleAudio 
    } = useContext(JanusContext);

    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 

    const gameStateRef = useRef(gameState);
    const hasJoinedJanus = useRef(false);

    const [showExitPopup, setShowExitPopup] = useState(false);

    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    const myPlayer = gameState?.players?.find(p => p.username === user.username);
    const amIAlive = myPlayer?.isAlive !== false; 

    // 1. INIZIALIZZA JANUS ALL'INGRESSO NEL GIOCO
    useEffect(() => {
        if (user) {
            initializeJanus();
        }
        // Cleanup quando si lascia la pagina Game definitivamente
        return () => {
            cleanupJanus();
            hasJoinedJanus.current = false;
        };
    }, [user, initializeJanus, cleanupJanus]);

    // 2. EFFETTUA IL JOIN AUDIO/VIDEO
    useEffect(() => {
        if (isJanusReady && janusStatus === 'connected' && !hasJoinedJanus.current && user) {
            console.log("🔊 Game: Join stanza audio...");
            joinRoom(roomId, user.username);
            hasJoinedJanus.current = true;
        }
    }, [isJanusReady, janusStatus, roomId, user, joinRoom]);


    // --- LOGICA SOCKET GENERALE ---
    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => setGameState(payload);
        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePhaseChange = (payload) => {
            console.log("⚡ Cambio fase:", payload.phase);
            setGameState(prevState => {
                if (!prevState) return payload;
                return { ...prevState, ...payload };
            });
        };

        socket.on('gameStarted', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('phaseChanged', handlePhaseChange);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('gameStarted'); socket.off('identityAssigned');
                socket.off('phaseChanged'); socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]);

    const handleLeaveGame = () => {
            disconnectSocket(); 
            cleanupJanus(); 
            navigate(`/`); 
    };

    const onExitClick = () => setShowExitPopup(true);
    const confirmExit = () => { setShowExitPopup(false); handleLeaveGame(); };

    if (!socket || !gameState) return <div className="game-loader">Caricamento...</div>;

    // Props comuni per l'audio da passare alle fasi
    const audioProps = {
        localStream,
        remoteStreams,
        toggleAudio
    };

    const renderPhaseContent = () => {
        const phase = gameState.phase;
        
        switch (phase) {
            case 'DICE': case 'lancio_dadi':
                return <PhaseDice gameState={gameState} user={user} {...audioProps} />;
            case 'TURN_ASSIGNMENT': case 'ordine_gioco':
                return <PhaseOrder gameState={gameState} user={user} {...audioProps} />;
            case 'GAME': case 'inizio_gioco':
                return <PhaseWord gameState={gameState} user={user} socket={socket} {...audioProps} />;
            case 'DISCUSSION': case 'discussione':
                return <PhaseDiscussion gameState={gameState} user={user} socket={socket} {...audioProps} />;
            case 'VOTING': case 'votazione':
                return <PhaseVoting gameState={gameState} user={user} socket={socket} {...audioProps}/>;
            case 'RESULTS': case 'risultati':
                return <PhaseResults gameState={gameState} user={user} />;
            case 'FINISH': case 'finita':
                return <PhaseFinish gameState={gameState} user={user} onLeave={handleLeaveGame} {...audioProps}/>;
            default:
                return <div style={{color:'white'}}>Fase: {phase}</div>;
        }
    };

    return (
        <div className={`game-page ${!amIAlive ? 'is-dead-mode' : ''}`}>

            {showExitPopup && (
                <div className="pixel-overlay">
                    <div className="pixel-bubble">
                        <h1 className="pixel-title">WHAT?</h1>
                        <p className="pixel-subtitle">Abbandoni la partita?</p>
                        <div className="pixel-buttons">
                            <button className="pixel-btn yes" onClick={confirmExit}>Sì, Addio</button>
                            <button className="pixel-btn no" onClick={() => setShowExitPopup(false)}>No, Resto!</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="game-card">
                <header className="game-header">
                    <div className="game-header-left">
                        <h1 className="game-room-id">
                            {roomId}
                        </h1>
                        <div className="game-header-sub">
                            <h2 className="game-round-title">
                                Round {gameState.currentRound || 1}
                            </h2>
                        </div>
                    </div>
                    <div className="game-header-right">
                        {!amIAlive && <div className="dead-status-badge">💀 SEI ELIMINATO</div>}
                        <button className="lobby-main-btn exit-btn btn-small-exit" onClick={onExitClick} aria-label="Esci">
                            Esci
                        </button>
                    </div>
                </header>
                
                {gameState.phase !== 'DICE' && (
                    <div className="game-secret-section">
                        <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                            {revealSecret ? "Nascondi Identità" : "Mostra Identità"}
                        </div>
                        {revealSecret && userIdentity && (
                            <div className="secret-content revealed">
                                <p>Ruolo: <span className={userIdentity.role === 'IMPOSTOR' ? 'role-impostor' : 'role-civilian'}>{userIdentity.role}</span></p>
                                <p>Parola: <span>{userIdentity.secretWord}</span></p>
                            </div>
                        )}
                    </div>
                )}

                <div className="phase-content-wrapper">
                    {renderPhaseContent()}
                </div>
            </div>
        </div>
    );
}

export default Game;