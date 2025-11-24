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
