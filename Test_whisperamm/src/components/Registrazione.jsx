import { useState } from 'react';
import './Registrazione.css'; // Puoi importare lo stile di default o il tuo CSS qui
import Home from './Home';

const Registrazione = () => {
    const [username, setUsername] = useState('');
    const [error, setError] = useState(null);
    const [registeredUser, setRegisteredUser] = useState(null); // Stato per l'utente loggato

    const handleSubmit = async (e) => { //e, event è un oggetto che il browser invia automaticamente alla funzione
        e.preventDefault(); //Normalmente,inviando un Form HTML il browser ricarica la pagina.
        setError(null);

        /*
        Serve settare error a null, perchè l'utente potrebbe vedere ancora l'errore vecchio, 
        inserendo un nome corretto dopo!
        */

        //Il controllo su ciò che scrive l'utente è ok fare una parte in front-end ma va fatto tutto in back!
        if (username.length < 3) {
            setError('Il nome deve essere di almeno 3 caratteri.');
            return;
        }

        try {
            
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
                //Caso Nome già in uso oppure valutato non valido dal backend
                if(response.status === 409 || response.status === 400){
                    throw new Error(data.message || "Nome utente non valido");
                }

                //Caso Errore del Server
                if(response.status ===500){
                    throw new Error(data.message || 'I nostri server hanno un problema, riprova più tardi..');   
                }
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
        return <Home user={registeredUser} />;
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
export default Registrazione; // <= NOTA: Esporta App