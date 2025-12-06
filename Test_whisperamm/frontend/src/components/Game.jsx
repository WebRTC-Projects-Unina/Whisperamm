import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 

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
    
    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 
    
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false); 

    const gameStateRef = useRef(gameState);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // Calcolo Stato attuale
    const myPlayer = gameState?.players?.find(p => p.username === user.username);
    // Se isAlive è undefined (inizio), consideralo vivo. Se è false, è morto.
    const amIAlive = myPlayer?.isAlive !== false; 

    useEffect(() => {
        if (gameState?.phase && gameState.phase !== 'DICE') {
            setActiveRolls([]); 
        }
    }, [gameState?.phase]);

    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => setGameState(payload);
        const handleIdentity = (payload) => setUserIdentity(payload);
        //Forse qui mettere direttamente il payload come user e game state è un pò sporco..

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
        if (window.confirm("Uscire?")) { disconnectSocket(); navigate(`/`); }
    };

    const handleDiceRoll = () => { 
        // Blocco di sicurezza aggiuntivo: i morti non lanciano
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

    const renderPhaseContent = () => {
        const phase = gameState.phase;
        const startTimer = gameState.startTimer || false;

        // Mappa delle fasi
        switch (phase) {
            case 'DICE': case 'lancio_dadi':
                return <PhaseDice gameState={gameState} user={user} activeRolls={activeRolls} onRollComplete={handleRollComplete} onDiceRoll={handleDiceRoll} isWaiting={isWaiting} startTimer={startTimer} />;
            case 'TURN_ASSIGNMENT': case 'ordine_gioco':
                return <PhaseOrder gameState={gameState} user={user} />;
            case 'GAME': case 'inizio_gioco':
                return <PhaseWord gameState={gameState} user={user} socket={socket} />;
            case 'DISCUSSION': case 'discussione':
                return <PhaseDiscussion gameState={gameState} user={user} socket={socket} />;
            case 'VOTING': case 'votazione':
                return <PhaseVoting gameState={gameState} user={user} socket={socket} />;
            case 'RESULTS': case 'risultati':
                return <PhaseResults gameState={gameState} user={user} />;
            case 'FINISH': case 'finita':
                return <PhaseFinish gameState={gameState} user={user} onLeave={handleLeaveGame} />;
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
                        {/* SE SEI MORTO APPARE QUESTO */}
                        {!amIAlive && <div className="dead-status-badge">💀 SEI ELIMINATO</div>}
                        <div className="game-room-badge">{roomId}</div>
                        <button className="game-btn-danger btn-small" onClick={handleLeaveGame}>Esci</button>
                    </div>
                </header>
                
                {/* IDENTITA' (Se sei morto potresti volerla vedere sempre o mai, qui la lasciamo) */}
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

                {/* WRAPPER CONTENUTO: Se è morto, il CSS blocca le interazioni qui dentro */}
                <div className="phase-content-wrapper">
                    {renderPhaseContent()}
                </div>

            </div>
        </div>
    );
}

export default Game;