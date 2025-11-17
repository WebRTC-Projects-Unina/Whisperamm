import { useState } from 'react';
import { useAuth } from "../context/AuthProvider.jsx";
import './Registrazione.css';
import Home from './Home';

const Registrazione = () => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);
    const { user, setUser } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (username.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username: username }),
                credentials: 'include' // Importante!
            });

            const data = await response.json();

            if (!response.ok) {
                if(response.status === 409 || response.status === 400){
                    throw new Error(data.message || "Nome utente non valido");
                }
                if(response.status === 500){
                    throw new Error(data.message || 'I nostri server hanno un problema, riprova più tardi..');
                }
            }

            console.log('Registrato:', data.user);
            setUser(data.user); // ✅ Salva l'intero oggetto { id: "...", username: "..." }
            
        } catch (err) {
            setError(err.message);
            console.log('Errore registrazione:', err);
        }
    };

    // Se l'utente è autenticato, vai a Home
    if (user) {
        return <Home />;
    }

    return (
        <div className="registration-container">
            <h1>Benvenuto a Whisperamm</h1>
            <p>Inserisci il nickname per giocare.</p>

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="username">Il tuo nickname</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Es. Pippozzo"
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

export default Registrazione;