// src/hooks/useGameLogic.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export const useGameLogic = (socket, roomId, user, disconnectSocket) => {
    const navigate = useNavigate();
    
    // --- STATI ---
    const [gameState, setGameState] = useState(null);
    const [userIdentity, setUserIdentity] = useState(null);
    const [activeRolls, setActiveRolls] = useState([]); // Per animazione dadi
    const [isWaiting, setIsWaiting] = useState(false);  // Per bloccare doppi click

    // Ref per accedere allo stato corrente dentro i listener senza dipendenze
    const gameStateRef = useRef(gameState);
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // --- AZIONI (Esposte al componente) ---
    
    const leaveGame = useCallback(() => {
        if (window.confirm("Vuoi davvero abbandonare la partita?")) {
            disconnectSocket();
            navigate('/');
        }
    }, [disconnectSocket, navigate]);

    const rollDice = useCallback(() => {
        if (isWaiting) return;
        
        // Controllo preventivo: se ho già lanciato nello stato locale, evito chiamate inutili
        const me = gameStateRef.current?.players?.find(p => p.username === user.username);
        if (me?.hasRolled) return;

        setIsWaiting(true);
        socket.emit('DiceRoll');
    }, [socket, isWaiting, user.username]);

    // --- SOCKET LISTENERS ---
    useEffect(() => {
        if (!socket) return;

        // Gestione inizio gioco
        const handleGameData = (payload) => {
            console.log("Game Data Sync:", payload);
            setGameState(payload);
        };

        const handleIdentity = (payload) => setUserIdentity(payload);

        const handlePhaseChange = (payload) => {
            console.log("⚡ Cambio fase:", payload);
            // Se usciamo dalla fase DICE, puliamo il tavolo dadi
            // Nota: gestiamo sia la stringa vecchia 'lancio_dadi' che la nuova 'DICE'
            if (payload.phase !== 'DICE' && payload.phase !== 'lancio_dadi') {
                setActiveRolls([]);
            }
            // Merge dello stato esistente con i nuovi dati di fase
            setGameState(prev => ({ ...prev, ...payload }));
        };

        const handleDiceRoll = (payload) => {
            const { username, dice1, dice2, color } = payload;
            
            // 1. Aggiungi animazione (DiceArena)
            // Fallback colore se il payload non lo ha
            const savedColor = gameStateRef.current?.players?.find(p => p.username === username)?.color;
            const finalColor = color || savedColor || '#fff';

            setActiveRolls(prev => [...prev, {
                id: Date.now() + Math.random(),
                username, dice1, dice2, color: finalColor
            }]);

            // 2. Aggiorna logicamente il giocatore nella lista (Sidebar)
            // Questo rende la spunta verde IMMEDIATA, senza aspettare la fine dell'animazione
            setGameState(prev => {
                if (!prev) return null;
                const totalValue = dice1 + dice2;
                return {
                    ...prev,
                    players: prev.players.map(p => 
                        p.username === username 
                            ? { ...p, hasRolled: true, diceValue: totalValue, dice1, dice2 } 
                            : p
                    )
                };
            });

            // Se sono io, sblocco l'attesa del bottone
            if (username === user.username) setIsWaiting(false);
        };

        const handleError = (err) => {
            alert(err.message);
            navigate('/');
        };

        // Mapping eventi
        socket.on('parametri', handleGameData);       // Legacy
        socket.on('gameStarted', handleGameData);     // Nuovo standard
        socket.on('identityAssigned', handleIdentity);
        socket.on('phaseChanged', handlePhaseChange);
        socket.on('playerRolledDice', handleDiceRoll);
        socket.on('lobbyError', handleError);

        return () => {
            socket.off('parametri');
            socket.off('gameStarted');
            socket.off('identityAssigned');
            socket.off('phaseChanged');
            socket.off('playerRolledDice');
            socket.off('lobbyError');
        };
    }, [socket, navigate, user.username]);

    return {
        gameState,
        userIdentity,
        activeRolls,
        isWaiting,
        actions: {
            leaveGame,
            rollDice
        }
    };
};