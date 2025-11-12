import React, { useState } from 'react';
import './App.css'; // Puoi importare lo stile di default o il tuo CSS qui

// Questo componente sarà il "contenitore" della logica post-registrazione
// Per ora, lo usiamo solo per mostrare i pulsanti.
const Lobby = ({ user }) => {
    return (
        <div className="lobby-container">
            <h2>Ciao, {user.username}!</h2>
            <p>Cosa vuoi fare?</p>
            <div className="lobby-options">
                <button className="btn btn-primary">Crea partita</button>
                <button className="btn btn-secondary">Unisciti a una partita</button>
            </div>
        </div>
    );
};


// Componente principale dell'applicazione (ex HomePage)
const App = () => { // <= NOTA: Rinominato da HomePage ad App
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);
    const [registeredUser, setRegisteredUser] = useState(null); // Stato per l'utente loggato

    const handleSubmit = async (e) => {
        e.preventDefault(); 
        setError(null); 

        if (username.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }

        try {
            // La richiesta usa /api/register
            // Grazie al proxy in vite.config.js, Vite la girerà a localhost:8080
            const response = await fetch('/api/register', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: username }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Errore durante la registrazione.');
            }

            console.log('Registrato:', data.user);
            setRegisteredUser(data.user);

        } catch (err) {
            setError(err.message);
        }
    };

    // === Logica di rendering ===

    // Se l'utente è già registrato, mostra la Lobby
    if (registeredUser) {
        return <Lobby user={registeredUser} />;
    }

    // Altrimenti, mostra il form di registrazione
    return (
        <div className="registration-container">
            <h1>Benvenuto a Whisperamm</h1>
            <p>Inserisci il tuo nome per giocare.</p>
            
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="username">Il tuo nome</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Es. Mario"
                        autoFocus
                    />
                </div>
                
                <button type="submit" className="btn btn-submit">
                    Entra
                </button>
                
                {error && <p className="error-message">{error}</p>}
            </form>
        </div>
    );
};

export default App; // <= NOTA: Esporta App