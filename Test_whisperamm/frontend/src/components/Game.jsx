import { useEffect } from "react";
import { use } from "react";



const Game = ({socket}) => {

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
            <button onClick={() => socket.emit('DiceRoll')}>Lancia dadi</button>
        </div>
    );


}
