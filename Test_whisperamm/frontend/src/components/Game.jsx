import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import DiceD12 from '../components/DiceD12'; // <--- IMPORTANTE: Importa il dado 3D
import '../style/Game.css';

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    const { socket, disconnectSocket } = useSocket(); 
    
    // STATI
    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 

    // --- SETUP LISTENER ---
    useEffect(() => {
        if (!socket) {
            navigate('/');
            return;
        }

        // 1. Setup handler ricezione stato iniziale
        const handleGameParams = (payload) => {
            console.log("Dati pubblici ricevuti:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => {
            setUserIdentity(payload);
        };

        // 2. GESTIONE LANCIO DADI (ANIMAZIONE)
        const handlePrintDiceRoll = (payload) => {
            console.log(`🎲 ${payload.username} ha fatto ${payload.diceValue}`);
            
            // FASE A: Attiviamo l'animazione "rolling" per quel giocatore
            setGameState(prevState => {
                if (!prevState || !prevState.players) return prevState;
                return {
                    ...prevState,
                    players: prevState.players.map(p => 
                        p.username === payload.username 
                            ? { ...p, isRolling: true } // Parte l'animazione frenetica
                            : p
                    )
                };
            });

            // FASE B: Dopo 1.5 secondi fermiamo il dado e mostriamo il numero
            setTimeout(() => {
                setGameState(prevState => {
                    if (!prevState || !prevState.players) return prevState;
                    return {
                        ...prevState,
                        players: prevState.players.map(p => 
                            p.username === payload.username 
                                ? { 
                                    ...p, 
                                    isRolling: false,      // Stop rotazione, atterra sulla faccia
                                    hasRolled: true,       // Segna come fatto
                                    diceValue: payload.diceValue // Imposta valore finale
                                  } 
                                : p
                        )
                    };
                });
            }, 1500); // Durata dell'animazione
        };

        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        // Aggiungiamo anche listener per cambio fase se serve
        // socket.on('phaseChange', handleGameParams);

        socket.on('lobbyError', (error) => {
            alert(`Errore: ${error.message}`);
            navigate('/');
        });

        return () => {
            if (socket) {
                socket.off('parametri', handleGameParams);
                socket.off('identityAssigned', handleIdentity);
                socket.off('playerRolledDice', handlePrintDiceRoll);
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]);

    // --- HANDLERS ---
    const handleLeaveGame = () => {
        if (window.confirm("Vuoi davvero uscire?")) {
            disconnectSocket();
            navigate(`/`);
        }
    };

    const handleDiceRoll = () => {
        if(socket) socket.emit('DiceRoll');
    };

    // --- RENDER HELPERS ---
    if (!socket || !gameState) return <div className="game-loader">Caricamento...</div>;

    // Calcoli per la UI
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    // Verifica se siamo nella fase dadi (adatta la stringa in base al tuo Enum backend)
    // Controlla se il backend manda 'DICE' o 'lancio_dadi'
    const isDicePhase = gameState.phase === 'DICE' || gameState.phase === 'lancio_dadi';

    return (
        <div className="game-page">
            <div className="game-card">
                {/* HEADER */}
                <header className="game-header">
                    <div>
                        <h1 className="game-title">Round {gameState.round}</h1>
                        <p className="game-status">Fase: {gameState.phase}</p>
                    </div>
                    <div className="room-badge">{roomId}</div>
                </header>

                {/* IDENTITÀ SEGRETA (A SCOMPARSA) */}
                <div className="secret-section">
                    <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                        {revealSecret ? "Nascondi Identità 🔒" : "Mostra Identità 👁️"}
                    </div>
                    
                    {revealSecret && userIdentity && (
                        <div className="secret-content revealed">
                            <p>Ruolo: <strong>{userIdentity.role}</strong></p>
                            <p>Parola: <strong>{userIdentity.secretWord}</strong></p>
                        </div>
                    )}
                </div>

                <hr className="divider"/>

                {/* --- TAVOLO CENTRALE DEI DADI --- */}
                <div className="game-table-area">
                    <h3>Tavolo da Gioco</h3>
                    
                    <div className="players-grid">
                        {gameState.players && gameState.players.map((p) => (
                            <div key={p.username} className={`player-slot ${p.username === user.username ? 'me' : ''}`}>
                                {/* Nome Giocatore */}
                                <div className="player-name">
                                    {p.username} {p.username === user.username && "(Tu)"}
                                </div>

                                {/* Area Dado: Mostra il dado se sta rollando o ha finito */}
                                <div className="dice-zone">
                                    {(p.isRolling || p.hasRolled) ? (
                                        <DiceD12 
                                            value={p.diceValue} 
                                            rolling={p.isRolling} 
                                        />
                                    ) : (
                                        // Placeholder vuoto o icona in attesa
                                        <div className="dice-placeholder">
                                            In attesa...
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CONTROLLI */}
                <div className="game-buttons">
                    {/* Mostra bottone solo se tocca a me e fase giusta */}
                    {isDicePhase && !amIReady ? (
                        <button className="game-btn-action" onClick={handleDiceRoll}>
                            🎲 LANCIA IL DADO
                        </button>
                    ) : (
                        <p className="status-text">
                            {amIReady ? "Hai già lanciato." : "Attendi il tuo turno..."}
                        </p>
                    )}

                    <button className="game-btn-danger" onClick={handleLeaveGame}>Esci</button>
                </div>
            </div>
        </div>
    );
}

export default Game;