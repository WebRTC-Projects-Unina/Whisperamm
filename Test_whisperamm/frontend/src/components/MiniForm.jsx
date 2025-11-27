import React, { useState } from 'react';
import '../style/Lobby.css';
const MiniForm = ({ roomId, onUserCreated, error: externalError }) => {
    const [usernameInput, setUsernameInput] = useState('');
    const [error, setError] = useState(externalError || null);
    const [loading, setLoading] = useState(false);

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
            
            // Callback al parent (Lobby)
            onUserCreated(data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lobby-page mini-form-page">
            <div className="lobby-card">
                <h1 className="lobby-title">Unisciti alla partita!</h1>
                <p className="lobby-room-code">{roomId}</p>
                <form className="chat-input-form" onSubmit={handleJoinRegister}>
                    <input 
                        type="text" 
                        className="chat-input" 
                        placeholder="Es. Pippozzo" 
                        value={usernameInput} 
                        onChange={(e) => setUsernameInput(e.target.value)} 
                        autoFocus
                        disabled={loading}
                    />
                    <button type="submit" className="chat-send-btn" disabled={loading}>
                        {loading ? 'Caricamento...' : 'Entra'}
                    </button>
                </form>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </div>
        </div>
    );
};

export default MiniForm;