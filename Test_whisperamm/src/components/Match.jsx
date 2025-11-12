// src/pages/Lobby.jsx
import React from 'react';
import { useParams } from 'react-router-dom';

function Lobby() {
    // Questo hook legge i "parametri" dall'URL
    // In /lobby/ABCDE, gameId sarà "ABCDE"
    const { gameId } = useParams();

    return (
        <div>
            <h1>Stai nella Lobby della partita!</h1>
            <p>Il codice della tua partita è: <strong>{gameId}</strong></p>

            {/* Qui metterai la logica del Punto 5 */}
            <p>In attesa di altri giocatori...</p>

            <button>Inizia Partita (solo Admin)</button>
        </div>
    );
}
export default Lobby;