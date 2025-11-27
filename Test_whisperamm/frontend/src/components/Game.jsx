import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import DiceArena from '../components/DiceArena'; 
import '../style/Game.css';

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

    // --- PULIZIA TAVOLO ---
    useEffect(() => {
        if (gameState?.phase || gameState?.round) {
            setActiveRolls([]); 
        }
    }, [gameState?.phase, gameState?.round]);

    useEffect(() => {
        if (!socket) { navigate('/'); return; }

        const handleGameParams = (payload) => {
            console.log("Dati pubblici:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePrintDiceRoll = (payload) => {
            const rollId = Date.now() + Math.random();
            
            const newRoll = {
                id: rollId,
                username: payload.username,
                dice1: payload.dice1,
                dice2: payload.dice2
            };

            // 1. AGGIUNGIAMO IL DADO E FACCIAMO PARTIRE L'ANIMAZIONE
            setActiveRolls(prev => [...prev, newRoll]);
            
            // NOTA: Abbiamo rimosso il setTimeout! 
            // L'aggiornamento dello stato avverrà tramite la callback onRollComplete
        };

        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        socket.on('lobbyError', (err) => { alert(err.message); navigate('/'); });

        return () => {
            if (socket) {
                socket.off('parametri');
                socket.off('identityAssigned');
                socket.off('playerRolledDice');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId, user.username]);

    const handleLeaveGame = () => {
        if (window.confirm("Uscire?")) { disconnectSocket(); navigate(`/`); }
    };

    const handleDiceRoll = () => { 
        if(isWaiting) return; 
        setIsWaiting(true);
        if(socket) socket.emit('DiceRoll'); 
    };

    // --- NUOVA FUNZIONE CALLBACK ---
    // Questa viene chiamata da DiceArena quando i dadi di un utente si fermano
    const handleRollComplete = (rollId, username, totalValue) => {
        
        // Sblocca il bottone se ero io
        if (username === user.username) {
            setIsWaiting(false);
        }

        // Aggiorna lo stato per mostrare il numero
        setGameState(prevState => {
            if (!prevState || !prevState.players) return prevState;
            return {
                ...prevState,
                players: prevState.players.map(p => 
                    p.username === username 
                        ? { 
                            ...p, 
                            hasRolled: true, 
                            diceValue: totalValue 
                          } 
                        : p
                )
            };
        });
    };

    if (!socket || !gameState) return <div className="game-loader">Caricamento...</div>;

    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    const isDicePhase = gameState.phase === 'DICE' || gameState.phase === 'lancio_dadi';

    return (
        <div className="game-page">
            <div className="game-card">
                <header className="game-header">
                    <div>
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">Fase: {gameState.phase}</p>
                    </div>
                    <div className="game-room-badge">Stanza: {roomId}</div>
                </header>
                
                <div className="game-secret-section">
                    <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                        {revealSecret ? "Nascondi Identità 🔒" : "Mostra Identità 👁️"}
                    </div>
                    {revealSecret && userIdentity && (
                        <div className="secret-content revealed">
                            <p><strong>Ruolo:</strong> {userIdentity.role}</p>
                            <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                        </div>
                    )}
                </div>

                <div className="game-table-area">
                    {/* DICE ARENA con CALLBACK */}
                    <div className="dice-arena-overlay" style={{ pointerEvents: 'none' }}> 
                        <DiceArena 
                            activeRolls={activeRolls} 
                            onRollComplete={handleRollComplete} // <--- Passiamo la funzione qui
                        />
                    </div>

                    <div className="players-grid">
                        {gameState.players && gameState.players.map((p) => (
                            <div key={p.username} className={`player-slot ${p.username === user.username ? 'me' : ''}`}>
                                <div className="player-name">
                                    {p.username} {p.username === user.username && "(Tu)"}
                                </div>
                                <div className="dice-result-badge">
                                    {/* Il numero apparirà magicamente quando DiceArena chiamerà la funzione */}
                                    {p.hasRolled ? p.diceValue : "..."}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="game-buttons">
                    {isDicePhase && !amIReady ? (
                        <button 
                            className="game-btn-action" 
                            onClick={handleDiceRoll}
                            disabled={isWaiting}
                            style={{ opacity: isWaiting ? 0.6 : 1, cursor: isWaiting ? 'not-allowed' : 'pointer' }}
                        >
                            {isWaiting ? "Lancio in corso..." : "🎲 LANCIA I DADI"}
                        </button>
                    ) : (
                        <p className="status-text">
                            {amIReady ? "Hai già lanciato." : "Attendi..."}
                        </p>
                    )}
                    <button className="game-btn-danger" onClick={handleLeaveGame}>Abbandona</button>
                </div>
            </div>
        </div>
    );
}

export default Game;