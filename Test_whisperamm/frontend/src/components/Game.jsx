// src/pages/Game.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 

// Importiamo le Viste (Phases)
import PhaseDice from './game/phaseDice';
import PhaseOrder from './game/phaseOrder';
import PhaseWord from './game/phaseWord';
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
    
    // Stati specifici per la fase Dadi (mantenuti qui perché gestiti dai socket globali)
    const [activeRolls, setActiveRolls] = useState([]); 
    const [isWaiting, setIsWaiting] = useState(false); 

    const gameStateRef = useRef(gameState);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // Pulizia tavolo dadi al cambio fase
    useEffect(() => {
        if (gameState?.phase && gameState.phase !== 'DICE' && gameState.phase !== 'lancio_dadi') {
            setActiveRolls([]); 
        }
    }, [gameState?.phase]);

    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => {
            console.log("Dati pubblici:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePrintDiceRoll = (payload) => {
            const playerInState = gameStateRef.current?.players?.find(p => p.username === payload.username);
            const playerColor = payload.color || playerInState?.color || '#ffffff';

            const newRoll = {
                id: Date.now() + Math.random(),
                username: payload.username,
                dice1: payload.dice1,
                dice2: payload.dice2,
                color: playerColor
            };
            setActiveRolls(prev => [...prev, newRoll]);
        };

        const handlePhaseChange = (payload) => {
            console.log("⚡ Cambio fase:", payload);
            setGameState(prevState => {
                if (!prevState) return payload;
                return { ...prevState, ...payload };
            });
        };

        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        socket.on('phaseChanged', handlePhaseChange);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('parametri');
                socket.off('identityAssigned');
                socket.off('playerRolledDice');
                socket.off('phaseChanged');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]);

    const handleLeaveGame = () => {
        if (window.confirm("Uscire?")) { disconnectSocket(); navigate(`/`); }
    };

    const handleDiceRoll = () => { 
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

    // --- LOGICA DI SELEZIONE FASE ---
    const renderPhaseContent = () => {
        const phase = gameState.phase;

        const startTimer = gameState.startTimer || false
        // Gestiamo sia i nomi vecchi che nuovi se necessario
        if (phase === 'DICE' || phase === 'lancio_dadi') {
            return (
                <PhaseDice 
                    gameState={gameState}
                    user={user}
                    activeRolls={activeRolls}
                    onRollComplete={handleRollComplete}
                    onDiceRoll={handleDiceRoll}
                    isWaiting={isWaiting}
                    startTimer={startTimer}
                />
            );
        } 
        else if (phase === 'TURN_ASSIGNMENT' || phase === 'ordine_gioco') {
            return (
                <PhaseOrder 
                    gameState={gameState}
                    user={user}
                    socket={socket}
                />
            );
        }else if (phase === 'GAME' || phase === 'inizio_gioco') {
            return (
                <PhaseWord
                    gameState={gameState}
                    user={user}
                    socket={socket}
                />
            );
        } else {
            return <div style={{color: 'white', textAlign: 'center'}}>Fase sconosciuta: {phase}</div>;
        }
    };

    console.log("Render Game con stato:", userIdentity, gameState);
    return (
        <div className="game-page">
            <div className="game-card">
                
                {/* HEADER COMUNE */}
                <header className="game-header">
                    <div className="game-header-left">
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">
                            Fase: <span style={{color: '#ff9800', textTransform:'uppercase'}}>{gameState.phase}</span>
                        </p>
                    </div>
                        <div className="game-header-center">
                        {/* Qui potrai aggiungere elementi nelle fasi successive */}
                    </div>
                    {/* MODIFICA: Aggiunta classe 'game-header-right' invece dello style inline */}
                    <div className="game-header-right">
                        <div className="game-room-badge">Stanza: {roomId}</div>
                        <button className="game-btn-danger btn-small" onClick={handleLeaveGame}>Esci</button>
                    </div>
                </header>
                <br/>
                {/* SEZIONE SEGRETA COMUNE (Nascosta nella fase di isDicePhase*/}
                {(gameState.phase !== 'DICE' && gameState.phase !== 'lancio_dadi') && (
                    <div className="game-secret-section">
                        <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                            {revealSecret ? "Nascondi Identità 🔒" : "Mostra Identità 👁️"}
                        </div>
                        {revealSecret && userIdentity && (
                            <div className="secret-content revealed">
                                <p><strong>Ruolo: </strong> 
                                    <span className={userIdentity.role === 'IMPOSTOR' ? 'role-impostor' : 'role-civilian'}>
                                        {userIdentity.role}
                                    </span>
                                </p>
                                <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- CONTENUTO DINAMICO DELLA FASE --- */}
                {renderPhaseContent()}

            </div>
        </div>
    );
}

export default Game;