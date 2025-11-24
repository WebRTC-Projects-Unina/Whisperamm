const { Game } = require('../services/game');
const { lobbies } = require('./state');

import { useEffect } from "react";




const Game = ({ gameId, user, socket }) => {

    useEffect(() => {

        socket.on('DiceRollResult', handleDiceRoll);
        
        // Cleanup alla disconnessione del componente
        return () => {
            socket.off('DiceRollResult', handleDiceRoll);
        }
    }, [socket]);

    const handleDiceRoll = (data) => {
        console.log("Dadi lanciati:", data);
        // Qui posso fare altre azioni
    };


    
    return (
        <div>
            <h2>Game Component</h2>
            <button onClick={() => {socket.emit('DiceRoll')}}>Lancia dadi</button>
        </div>
    );


}
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import '../style/Game.css';

function Game() {
    const { gameId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Simula il caricamento
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    const handleBackToLobby = () => {
        navigate(`/`);
        //bisogna vedere la socket che cosa combina a sto punto
    };

    if (isLoading) {
        return (
            <div className="game-page">
                <div className="game-card">
                    <h1 className="game-subtitle">Caricamento partita...</h1>
                </div>
            </div>
        );
    }

    return (
        <div className="game-page">
            <div className="game-card">
                <h1 className="game-title">🎮 Ciao!</h1>
                <p className="game-subtitle">Il game è iniziato</p>
                
                <div className="game-info">
                    <p className="game-label">Giocatore</p>
                    <p className="game-username">{user?.username || 'Sconosciuto'}</p>
                    <p className="game-label">Stanza</p>
                    <p className="game-room-code">{gameId}</p>
                </div>

                <p className="game-message">La tua partita è in corso...</p>

                <div className="game-buttons">
                    <button className="game-btn" onClick={handleBackToLobby}>
                        Torna alla Lobby
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Game;
