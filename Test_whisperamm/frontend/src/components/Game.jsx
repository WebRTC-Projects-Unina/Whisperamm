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
    
    // Recuperiamo la socket dal Context (connessione già attiva dalla Lobby)
    const { socket, disconnectSocket } = useSocket(); 
    
    // STATI PER I DATI DI GIOCO
    const [gameState, setGameState] = useState(null);      // Dati pubblici (da 'parametri')
    const [userIdentity, setUserIdentity] = useState(null); // Dati privati (da 'identityAssigned')
    const [revealSecret, setRevealSecret] = useState(false); // UI: per nascondere/mostrare la parola



    // --- SETUP LISTENER ---
    useEffect(() => {
        if (!socket) {
            navigate('/');
            return;
        }

        console.log("🎮 Game montato. Setup listener...");

        const handleGameParams = (payload) => {
            console.log("Dati pubblici ricevuti:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => {
            console.log("Identità ricevuta:", payload);
            setUserIdentity(payload);
        };

        // 1. Attiviamo le orecchie
        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);

        // Cleanup
        return () => {
            if (socket) {
                socket.off('parametri', handleGameParams);
                socket.off('identityAssigned', handleIdentity);
            }
        };
    }, [socket, navigate, roomId]); // Aggiunto roomId alle dipendenze




    // --- HANDLERS AZIONI ---
    const handleLeaveGame = () => {
        if (window.confirm("Sei sicuro di voler abbandonare la partita?")) {
            disconnectSocket(); // Chiude la connessione
            navigate(`/`);
        }
    };

    const handleDiceRoll = () => {
        if(socket) {
            // Esempio azione
            socket.emit('DiceRoll');
        }
    };

    // --- RENDER ---
    
    // Se non abbiamo ancora i dati essenziali, mostriamo un loader
    if (!socket || !gameState) {
        return (
            <div className="game-page">
                <div className="game-card">
                    <h1 className="game-subtitle">In attesa dei dati di gioco...</h1>
                    <div className="spinner"></div> {/* Aggiungi css spinner se vuoi */}
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
                        <p className="game-subtitle">Fase: {gameState.phase || 'Loading...'}</p>
                    </div>
                    <div className="game-room-badge">
                        Stanza: {roomId}
                    </div>
                </header>
                
                <hr className="divider"/>

                {/* INFO SEGRETE UTENTE */}
                <div className="game-secret-section">
                    <h3>La tua Identità</h3>
                    
                    {userIdentity ? (
                        <div className="secret-card" onClick={() => setRevealSecret(!revealSecret)}>
                            <p className="secret-label">
                                {revealSecret ? "Nascondi 🔒" : "Tocca per rivelare 👁️"}
                            </p>
                            
                            <div className={`secret-content ${revealSecret ? 'revealed' : 'blurred'}`}>
                                {/* Adatta questi campi in base a cosa manda PayloadUtils.buildPrivateIdentity */}
                                <p><strong>Ruolo:</strong> {userIdentity.role || 'Giocatore'}</p>
                                {userIdentity.secretWord && (
                                    <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p>Assegnazione ruolo in corso...</p>
                    )}
                </div>

                <div className="game-area">
                    {/* Qui visualizzi lo stato pubblico (es. chi tocca giocare) */}
                    <p className="game-status-text">
                        Giocatori attivi: {gameState.activePlayersCount || '?'}
                    </p>
                </div>

                {/* PULSANTIERA */}
                <div className="game-buttons">
                    <button className="game-btn-action" onClick={handleDiceRoll}>
                        🎲 Azione Gioco
                    </button>
                    <button className="game-btn-danger" onClick={handleLeaveGame}>
                        Abbandona
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Game;