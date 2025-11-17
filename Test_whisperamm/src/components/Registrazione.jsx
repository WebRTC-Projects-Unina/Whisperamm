import { useState } from 'react';
import { useAuth } from "../context/AuthContext.jsx"; // <-- 1. Importi il tuo hook (già c'era, ottimo!)
import './Registrazione.css';
import Home from './Home';

const Registrazione = () => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);

    //Prendiamo 'user' e 'setUser' dal context
    const { user, setUser } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // ...tutta la tua validazione (va benissimo)
        if (username.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }

        try {
            // facciamo la fetch per registrare l'utente
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: username }),
            });

            const data = await response.json();

            if (!response.ok) {
                // ...tutta la tua gestione errori (va benissimo)
                if(response.status === 409 || response.status === 400){
                    throw new Error(data.message || "Nome utente non valido");
                }
                if(response.status ===500){
                    throw new Error(data.message || 'I nostri server hanno un problema, riprova più tardi..');
                }
            }

            console.log('Registrato:', data.user);

            // --- MODIFICA QUI ---
            // 3. Salva l'utente nello stato GLOBALE (il context)
            setUser(data.user);
        } catch (err) {
            setError(err.message);
        }
    };

    // === Logica di rendering ===

    // --- MODIFICHE QUI ---
    // 4. Controlla 'user' dal context, non più lo stato locale
    if (user) {
        // 'Home' ora non ha più bisogno della prop 'user',
        // perché può prenderlo da solo dal context.
        return <Home />;
    }

    // Altrimenti, mostra il form di registrazione
    // (Questa parte è rimasta identica)
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
