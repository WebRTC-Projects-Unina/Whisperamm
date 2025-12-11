import React, { useState } from 'react';
import '../style/Registrazione.css';
const MiniForm = ({ roomId, onUserCreated, error: externalError }) => {
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(externalError || null);
    const [loading, setLoading] = useState(false);

    // Stato per l'animazione di uscita (come in Registrazione)
    const [isExiting, setIsExiting] = useState(false);

    const handleJoinRegister = async (e) => {
        e.preventDefault();
        setError(null);
        
        if (usernameInput.length < 3) {
            setError('Nome troppo corto.');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/register', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput }),
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Errore');
            
            // 1. Avvia l'animazione di uscita
            setIsExiting(true);

            // 2. Aspetta che finisca l'animazione (800ms) prima di passare i dati al padre
            setTimeout(() => {
                onUserCreated(data.user);
            }, 800);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        // Wrapper esterno con classe condizionale per l'uscita
        <div className={`registration-wrapper ${isExiting ? 'exiting' : ''}`}>
            <div className="registration-container">
                
                {/* Titolo stile Registrazione */}
                <h1>Benvenuto a<br />Whisperam</h1>
                
                {/* Mostriamo il codice stanza in stile sottotitolo/codice */}
                <div className="room-code-subtitle">
                    {roomId}
                </div>

                <form onSubmit={handleJoinRegister}>
                    <div className="form-group">
                        <label htmlFor="username">Inserisci il tuo nickname</label>
                        <input 
                            type="text"
                            id="username"
                            className="chat-input" // O usa lo stile standard se preferisci
                            placeholder="Es. Pippozzo" 
                            value={usernameInput} 
                            onChange={(e) => setUsernameInput(e.target.value)} 
                            disabled={isExiting}
                            autoComplete="off"
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="btn btn-submit" 
                        disabled={isExiting}
                    >
                        {isExiting ? '...' : 'ENTRA IN STANZA'}
                    </button>
                    
                    {error && <p className="error-message">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default MiniForm;