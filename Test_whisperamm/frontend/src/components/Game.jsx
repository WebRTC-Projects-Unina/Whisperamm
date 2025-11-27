// src/pages/Game.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { useSocket } from '../context/SocketProvider'; 
import DiceArena from '../components/DiceArena'; // Assicurati che questo file esista!
import '../style/Game.css';

const Game = () => {
    const { roomId } = useParams(); 
    const { user } = useAuth();
    const navigate = useNavigate();
    const { socket, disconnectSocket } = useSocket(); 
    
    // STATI DATI DI GIOCO
    const [gameState, setGameState] = useState(null);      
    const [userIdentity, setUserIdentity] = useState(null); 
    const [revealSecret, setRevealSecret] = useState(false); 
    
    // STATO PER GESTIRE L'ANIMAZIONE 3D (Overlay)
    // Se questo non è null, viene mostrato il tavolo 3D sopra tutto il resto
    const [currentRoll, setCurrentRoll] = useState(null); // es: { username: 'Mario', dic1: 3, dice2: 5 }

    // --- SETUP LISTENER ---
    useEffect(() => {
        if (!socket) {
            navigate('/');
            return;
        }

        // Gestore aggiornamento stato generale
        const handleGameParams = (payload) => {
            console.log("Dati pubblici ricevuti:", payload);
            setGameState(payload);
        };

        // Gestore identità segreta
        const handleIdentity = (payload) => {
            console.log("Identità ricevuta:", payload);
            setUserIdentity(payload);
        };

        // --- GESTORE LANCIO DADI (CUORE DELL'ANIMAZIONE) ---
        const handlePrintDiceRoll = (payload) => {
            
            setCurrentRoll({ 
                username: payload.username, 
                dice1: payload.dice1,
                dice2: payload.dice2 
            });
            // 3. AGGIORNA I DATI SOTTOSTANTI (GRIGLIA)
            setGameState(prevState => {
                // Controllo di sicurezza: se lo stato o i giocatori non esistono, non fare nulla
                if (!prevState || !prevState.players) return prevState;

                return {
                    ...prevState,
                    // Mappiamo l'array dei giocatori per trovare quello giusto
                    players: prevState.players.map(p => 
                        p.username === payload.username 
                            ? { 
                                ...p, 
                                hasRolled: true, 
                                // MODIFICA: Salviamo i singoli dadi
                                dice1: payload.dice1,
                                dice2: payload.dice2,
                                // CONSIGLIO: Calcola o salva il totale (utile per il movimento)
                                diceValue: payload.dice1 + payload.dice2 
                            } 
                            : p // Se non è il giocatore corrente, lo lasciamo invariato
                        )
                    };
            });

            setTimeout(() => {
                setCurrentRoll(null);
            }, 4500); 
        };

        // Attiviamo i listener
        socket.on('parametri', handleGameParams);
        socket.on('identityAssigned', handleIdentity);
        socket.on('playerRolledDice', handlePrintDiceRoll);
        
        socket.on('lobbyError', (error) => {
            alert(`Errore di gioco: ${error.message}`);
            navigate('/');
        });

        // Cleanup quando il componente viene smontato
        return () => {
            if (socket) {
                socket.off('parametri');
                socket.off('identityAssigned');
                socket.off('playerRolledDice');
                socket.off('lobbyError');
            }
        };
    }, [socket, navigate, roomId]);


    // --- HANDLERS AZIONI ---
    const handleLeaveGame = () => {
        if (window.confirm("Sei sicuro di voler abbandonare la partita?")) {
            disconnectSocket(); 
            navigate(`/`);
        }
    };

    const handleDiceRoll = () => {
        console.log("Richiesta di rollare il dado inviata");
        if(socket) {
            socket.emit('DiceRoll');
        }
    };

    // --- RENDER ---
    
    // Loader iniziale
    if (!socket || !gameState) {
        return (
            <div className="game-page">
                <div className="game-card">
                    <h1 className="game-subtitle">In attesa dei dati...</h1>
                    <div className="spinner"></div> 
                </div>
            </div>
        );
    }

    // Calcoli UI
    const myPlayer = gameState.players?.find(p => p.username === user.username);
    const amIReady = myPlayer?.hasRolled;
    // Verifica compatibilità con la stringa inviata dal backend
    const isDicePhase = gameState.phase === 'DICE' || gameState.phase === 'lancio_dadi';

    return (
        <div className="game-page">
            <div className="game-card">
                {/* HEADER */}
                <header className="game-header">
                    <div>
                        <h1 className="game-title">Round {gameState.currentRound || 1}</h1>
                        <p className="game-subtitle">Fase: {gameState.phase}</p>
                    </div>
                    <div className="game-room-badge">
                        Stanza: {roomId}
                    </div>
                </header>
                
                <hr className="divider"/>

                {/* INFO SEGRETE UTENTE */}
                <div className="game-secret-section">
                    <div className="secret-toggle" onClick={() => setRevealSecret(!revealSecret)}>
                        {revealSecret ? "Nascondi Identità 🔒" : "Mostra Identità 👁️"}
                    </div>
                    
                    {revealSecret && userIdentity && (
                        <div className="secret-content revealed">
                            <p><strong>Ruolo:</strong> {userIdentity.role}</p>
                            {userIdentity.secretWord && (
                                <p className="secret-word">Parola: <span>{userIdentity.secretWord}</span></p>
                            )}
                        </div>
                    )}
                </div>

                {/* --- TAVOLO CENTRALE --- */}
                <div className="game-table-area">
                    
                    {/* SCENARIO A: C'È UN LANCIO IN CORSO? MOSTRA L'ARENA 3D! */}
                    {currentRoll ? (
                        <div className="dice-arena-overlay">
                            <DiceArena 
                                d1={currentRoll.dice1}
                                d2={currentRoll.dice2} 
                                label={currentRoll.username}
                            />
                        </div>
                    ) : (
                        // SCENARIO B: NESSUN LANCIO, MOSTRA LA GRIGLIA RIEPILOGATIVA
                        <div className="players-grid">
                            <h3 style={{width: '100%', marginBottom: '15px', color: '#ccc'}}>Risultati</h3>
                            {gameState.players && gameState.players.map((p) => (
                                <div key={p.username} className={`player-slot ${p.username === user.username ? 'me' : ''}`}>
                                    <div className="player-name">
                                        {p.username} {p.username === user.username && "(Tu)"}
                                    </div>
                                    {/* Mostriamo il numero se ha lanciato, altrimenti puntini */}
                                    <div className="dice-result-badge">
                                        {p.hasRolled ? p.diceValue : "..."}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* --- FOOTER: PULSANTI --- */}
                <div className="game-buttons">
                    {/* Mostra il tasto ROLLA solo se è la fase giusta e non ho ancora fatto */}
                    {isDicePhase && !amIReady ? (
                        <button className="game-btn-action" onClick={handleDiceRoll}>
                            🎲 LANCIA I DADI
                        </button>
                    ) : (
                        <p className="status-text">
                            {amIReady ? "Hai già lanciato. Attendi gli altri." : "Attendi il tuo turno..."}
                        </p>
                    )}

                    <button className="game-btn-danger" onClick={handleLeaveGame}>
                        Abbandona
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Game;