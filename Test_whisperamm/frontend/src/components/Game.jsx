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
    
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false); 

    const gameStateRef = useRef(gameState);
    const hasJoinedJanus = useRef(false);

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


    // --- LOGICA SOCKET ESISTENTE ---
    useEffect(() => {
        if (gameState?.phase && gameState.phase !== 'DICE') {
            setActiveRolls([]); 
        }
    }, [gameState?.phase]);

    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => setGameState(payload);
        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePrintDiceRoll = (payload) => {
            const playerInState = gameStateRef.current?.players?.find(p => p.username === payload.username);
            const playerColor = payload.color || playerInState?.color || '#ffffff';
            setActiveRolls(prev => [...prev, {
                id: Date.now() + Math.random(),
                username: payload.username,
                dice1: payload.dice1,
                dice2: payload.dice2,
                color: playerColor
            }]);
        };

        const handlePhaseChange = (payload) => {
            console.log("⚡ Cambio fase:", payload.phase);
            setGameState(prevState => {
                if (!prevState) return payload;
                return { ...prevState, ...payload };
            });
        };

        socket.on('gameStarted', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        socket.on('phaseChanged', handlePhaseChange);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('gameStarted'); socket.off('identityAssigned');
                socket.off('playerRolledDice'); socket.off('phaseChanged');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]);

    const handleLeaveGame = () => {
        if (window.confirm("Uscire?")) { 
            disconnectSocket(); 
            cleanupJanus(); // Pulisci anche audio
            navigate(`/`); 
        }
    };

    const handleDiceRoll = () => { 
        if (!amIAlive) return; 
        if(isWaiting) return; 
        setIsWaiting(true);
        if(socket) socket.emit('DiceRoll'); 
    };

    const handleRollComplete = (rollId, username, totalValue) => {
        if (username === user.username) setIsWaiting(false);
        setGameState(prevState => {
            if (!prevState || !prevState.players) return prevState;
            return {
                ...prevState,
                players: prevState.players.map(p => 
                    p.username === username 
                        ? { ...p, hasRolled: true, diceValue: totalValue } 
                        : p
                )
            };
        });
    };

    if (!socket || !gameState) return <div className="game-loader">Caricamento...</div>;

    // Props comuni per l'audio da passare alle fasi
    const audioProps = {
        localStream,
        remoteStreams,
        toggleAudio // <--- Ora le fasi riceveranno questa funzione
    };

    const renderPhaseContent = () => {
        const phase = gameState.phase;
        const startTimer = gameState.startTimer || false;

        switch (phase) {
            case 'DICE': case 'lancio_dadi':
                return <PhaseDice gameState={gameState} user={user} activeRolls={activeRolls} onRollComplete={handleRollComplete} onDiceRoll={handleDiceRoll} isWaiting={isWaiting} startTimer={startTimer} {...audioProps} />;
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
            <div className="game-card">
                <header className="game-header">
                    <div className="game-header-left">
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">Fase: <span style={{color: '#ff9800'}}>{gameState.phase}</span></p>
                    </div>
                    <div className="game-header-right">
                        {!amIAlive && <div className="dead-status-badge">💀 SEI ELIMINATO</div>}
                        <div className="game-room-badge">{roomId}</div>
                        <button className="game-btn-danger btn-small" onClick={handleLeaveGame}>Esci</button>
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