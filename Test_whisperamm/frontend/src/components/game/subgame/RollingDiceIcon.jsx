// src/components/RollingDiceIcon.jsx
import React, { useEffect, useState } from 'react';

const RollingDiceIcon = () => {
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const [index, setIndex] = useState(0);

    useEffect(() => {
        // Cambia faccia ogni 120ms per simulare il movimento
        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % faces.length);
        }, 120);
        
        // Pulizia quando il componente viene smontato (es. quando il giocatore ha lanciato)
        return () => clearInterval(interval);
    }, []);

    return (
        <span className="rolling-dice-anim">
            {faces[index]}
        </span>
    );
};

export default RollingDiceIcon;