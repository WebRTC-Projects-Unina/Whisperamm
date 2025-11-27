// src/components/DiceD12.jsx
import React, { useEffect, useState } from 'react';
import '../style/DiceD12.css';

const DiceD12 = ({ value, rolling }) => {
    // Stato per la trasformazione (rotazione) del dado
    const [transformStyle, setTransformStyle] = useState({});

    // DEFINIZIONE DEGLI ANGOLI PER OGNI FACCIA (1-12)
    // Questi sono gli angoli INVERSI necessari per portare quella faccia davanti alla telecamera.
    // Basati sulla geometria del dodecaedro.
    const faceRotations = {
        1:  { x: 0, y: 0 },         // Faccia 1 (Top)
        2:  { x: -63.4, y: 0 },     // Anello superiore
        3:  { x: -63.4, y: -72 },
        4:  { x: -63.4, y: -144 },
        5:  { x: -63.4, y: -216 },
        6:  { x: -63.4, y: -288 },
        7:  { x: 116.6, y: 36 },    // Anello inferiore (sfalsato)
        8:  { x: 116.6, y: 108 },
        9:  { x: 116.6, y: 180 },
        10: { x: 116.6, y: 252 },
        11: { x: 116.6, y: 324 },
        12: { x: 180, y: 0 }        // Faccia 12 (Bottom)
    };

    useEffect(() => {
        if (rolling) {
            // FASE 1: Rotolamento CAOS
            // Generiamo angoli casuali enormi per dare l'idea del movimento
            const randomX = 720 + Math.random() * 720; // Almeno 2-4 giri completi
            const randomY = 720 + Math.random() * 720;
            const randomZ = 360 + Math.random() * 360;

            setTransformStyle({
                transform: `rotateX(${randomX}deg) rotateY(${randomY}deg) rotateZ(${randomZ}deg)`,
                transition: 'transform 0.5s linear' // Movimento veloce e lineare
            });
        } else {
            // FASE 2: Atterraggio
            // Recuperiamo la rotazione target per il numero uscito
            const target = faceRotations[value] || faceRotations[1];
            
            // Aggiungiamo 1080 gradi (3 giri extra) per frenare dolcemente
            // Nota: sottraiamo o aggiungiamo in base a come vogliamo l'entrata, qui resettiamo la rotazione
            // Per farlo sembrare naturale, bisogna "sommare" ai giri attuali, ma per semplicità CSS:
            // Impostiamo una transizione lunga (ease-out) verso l'angolo preciso.
            
            // Trucco: Aggiungiamo giri multipli di 360 per non farlo "tornare indietro" bruscamente
            // Ma per il dodecaedro è complesso calcolare il percorso più breve.
            // Resettiamo su una rotazione "pulita" + l'angolo della faccia.
            
            setTransformStyle({
                transform: `rotateX(${target.x - 720}deg) rotateY(${target.y - 720}deg) rotateZ(0deg)`,
                transition: 'transform 1.5s cubic-bezier(0.1, 0.67, 0.19, 1)' // Effetto frenata realistico
            });
        }
    }, [rolling, value]);

    return (
        <div className="d12-scene">
            <div className={`d12-wrapper ${rolling ? 'shaking' : ''}`}>
                <div className="d12" style={transformStyle}>
                    {/* Generiamo le 12 facce */}
                    <div className="face face-1">1</div>
                    <div className="face face-2">2</div>
                    <div className="face face-3">3</div>
                    <div className="face face-4">4</div>
                    <div className="face face-5">5</div>
                    <div className="face face-6">6</div>
                    <div className="face face-7">7</div>
                    <div className="face face-8">8</div>
                    <div className="face face-9">9</div>
                    <div className="face face-10">10</div>
                    <div className="face face-11">11</div>
                    <div className="face face-12">12</div>
                </div>
            </div>
        </div>
    );
};

export default DiceD12;