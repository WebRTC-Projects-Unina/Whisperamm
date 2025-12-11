import { useState } from 'react';
import { useAuth } from "../context/AuthProvider.jsx";
import '../style/Registrazione.css';
import Home from './Home.jsx';

const Registrazione = () => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);
    const { user, setUser } = useAuth();

    // NUOVO STATO: Ci serve per sapere se stiamo "uscendo"
    const [isExiting, setIsExiting] = useState(false);


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
            // 1. Attiviamo l'animazione
            setIsExiting(true); 

            // 2. Aspettiamo 800ms (0.8 secondi) che finisca l'effetto CSS
            setTimeout(() => {
                console.log('Registrato:', data.user);
                setUser(data.user); // Questo causerà il cambio pagina DOPO l'animazione
            }, 800);
            
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
        /* AGGIUNTO UN DIV WRAPPER ESTERNO "registration-wrapper" */
        <div className={`registration-wrapper ${isExiting ? 'exiting' : ''}`}>
            <div className="registration-container">
                <h1>Benvenuto a<br />Whisperamm</h1>
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Inserisci il tuo nickname</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Es. Pippozzo"
                            disabled={isExiting}
                            // autoFocus rimosso come richiesto
                        />
                    </div>
                    <button 
                        type="submit" 
                        className="btn btn-submit"
                        disabled={isExiting}
                    >
                        {isExiting ? '...' : 'ENTRA'}
                    </button>
                    {error && <p className="error-message">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default Registrazione;
