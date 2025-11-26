// src/pages/Game.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import '../style/Game.css';

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // Recuperiamo la socket già attiva
    const { socket, disconnectSocket } = useSocket(); 
    
    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 

    // --- SETUP LISTENER ---
    useEffect(() => {
        // Se F5/Refresh -> socket perso -> Home
        if (!socket) {
            navigate('/');
            return;
        }

        console.log("🎮 Game montato. In ascolto...");

        // Handler Pubblico
        const handleGameParams = (payload) => {
            console.log("📦 Dati pubblici ricevuti:", payload);
            setGameState(payload);
        };

        // Handler Privato
        const handleIdentity = (payload) => {
            console.log("🕵️ Identità ricevuta:", payload);
            setUserIdentity(payload);
        };

        // 1. ASCOLTO (Niente emit, aspettiamo il push del server)
        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);

        // Cleanup
        return () => {
            if (socket) {
                socket.off('parametri', handleGameParams);
                socket.off('identityAssigned', handleIdentity);
            }
        };
    }, [socket, navigate, roomId]);


    // --- UI E LOGICA ---
    const handleLeaveGame = () => {
        if (window.confirm("Sei sicuro di voler abbandonare la partita?")) {
            disconnectSocket(); 
            navigate(`/`);
        }
    };

    const handleDiceRoll = () => {
        if(socket) socket.emit('DiceRoll', { roomId });
    };

    // --- RENDER ---
    
    // Loader iniziale mentre aspettiamo il timeout del server
    if (!socket || !gameState) {
        return (
            <div className="game-page">
                <div className="game-card">
                    <h1 className="game-subtitle">Preparazione tavolo...</h1>
                    <div className="spinner"></div> 
                    <p style={{fontSize: '0.8rem', color: '#666', marginTop: '10px'}}>
                        Sincronizzazione dati in corso...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="game-page">
            <div className="game-card">
                {/* HEADER */}
                <header className="game-header">
                    <div>
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">Fase: {gameState.phase || '...'}</p>
                    </div>
                    <div className="game-room-badge">ID: {roomId}</div>
                </header>
                
                <hr className="divider"/>

                {/* IDENTITÀ */}
                <div className="game-secret-section">
                    <h3>La tua Identità</h3>
                    {userIdentity ? (
                        <div className="secret-card" onClick={() => setRevealSecret(!revealSecret)}>
                            <p className="secret-label">
                                {revealSecret ? "Nascondi 🔒" : "Tocca per rivelare 👁️"}
                            </p>
                            <div className={`secret-content ${revealSecret ? 'revealed' : 'blurred'}`}>
                                <p><strong>Ruolo:</strong> {userIdentity.role}</p>
                                {userIdentity.secretWord && (
                                    <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p>Caricamento identità...</p>
                    )}
                </div>

                <div className="game-area">
                    <p className="game-status-text">
                        Giocatori: {gameState.activePlayersCount || gameState.players?.length || '?'}
                    </p>
                </div>

                <div className="game-buttons">
                    <button className="game-btn-action" onClick={handleDiceRoll}>🎲 Azione</button>
                    <button className="game-btn-danger" onClick={handleLeaveGame}>Esci</button>
                </div>
            </div>
        </div>
    );
}

export default Game;