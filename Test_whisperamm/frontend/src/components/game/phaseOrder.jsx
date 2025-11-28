// src/components/game/PhaseOrder.jsx
import React from 'react';

const PhaseOrder = ({ gameState, user }) => {
    
    // Ordiniamo i giocatori in base al numero di dado (decrescente)
    // Assumiamo che il backend abbia già ordinato l'array o lo facciamo qui
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => b.diceValue - a.diceValue);

    return (
        <div className="game-content-row">
            {/* AREA CENTRALE DIVERSA PER QUESTA FASE */}
            <div className="game-table-area" style={{ flexDirection: 'column', justifyContent: 'flex-start', paddingTop: '40px' }}>
                <h2 style={{ color: '#fff', textTransform: 'uppercase', marginBottom: '30px' }}>
                    Ordine di Gioco Stabilito
                </h2>
                
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {sortedPlayers.map((p, index) => (
                        <div key={p.username} style={{
                            background: p.username === user.username ? 'rgba(210, 73, 255, 0.2)' : 'rgba(0,0,0,0.3)',
                            border: `2px solid ${p.color || '#ccc'}`,
                            padding: '20px',
                            borderRadius: '15px',
                            textAlign: 'center',
                            minWidth: '150px',
                            animation: `popIn 0.5s ease-out ${index * 0.2}s forwards`,
                            opacity: 0,
                            transform: 'scale(0.8)'
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>#{index + 1}</div>
                            <div style={{ margin: '10px 0', fontSize: '1.2rem', fontWeight: 'bold', color: '#d249ff' }}>
                                {p.username}
                            </div>
                            <div style={{ fontSize: '1rem', color: '#ccc' }}>Ha fatto {p.diceValue}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SIDEBAR RIDOTTA PER QUESTA FASE (Opzionale) */}
            <aside className="game-sidebar">
                <h3 className="sidebar-title">Info Turno</h3>
                <p style={{color:'#ccc', padding:'10px'}}>
                    Il giocatore con il punteggio più alto inizia per primo. In caso di pareggio... (logica spareggio).
                </p>
            </aside>
        </div>
    );
};

export default PhaseOrder;