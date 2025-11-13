import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css'; // <-- 1. Importa il NUOVO file CSS

const Home = ({ user }) => {
    //Stati
    const [isJoining, setIsJoining] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [lobbyName, setLobbyName] = useState('');
    const [gameID, setGameID] = useState('');
    const [error, setError] = useState(null); // Stato per gli errori

    const navigate = useNavigate(); //Questo è un altro hook



    const handleSubmitNewGame = async (e) => {
        e.preventDefault();
        setError(null); // Pulisci errori vecchi
        if (lobbyName.length < 3) {
            setError("Il nome della stanza è troppo corto");
            return;
        }

        try {
            // Contatta il backend per validare e creare la stanza
            console.log("Famo arriva sta richiestina..")
            const response = await fetch('/api/createGame', { // L'URL del tuo backend
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Invia il nome e l'utente che la crea
                body: JSON.stringify({ roomName: lobbyName, user: user })
            });

            const data = await response.json();

            if (!response.ok) { //Sistemare
                // Errore dal server (es. "Nome già in uso")
                throw new Error(data.message || 'Errore durante la creazione');
            }

            // Il server ha validato e risposto con l'ID della stanza
            console.log("Stanza creata, ID:", data.roomId);

            //Qui metteremo anche la connessione con Socket.io e poi  navighi alla pagina della partita
            navigate(`/match/${data.roomId}`);

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    // Logica per ENTRARE (HTTP)
    const handleSubmitJoinGame = async (e) => {
        e.preventDefault();
        setError(null);
        if (gameID.length < 3) {
            setError("L'ID della stanza è troppo corto");
            return;
        }

        try {
            // Fai una chiamata HTTP per VEDERE SE la stanza esiste
            // (Il tuo backend deve avere una rotta GET /api/game/check/:gameId)
            const response = await fetch(`/api/game/check/${gameID}`, { // L'URL del tuo backend
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Invia il nome e l'utente che la crea
                body: JSON.stringify({ user: user })
            });

            console.log(response);
            if (!response.ok) {
                // Il server ha risposto 404 (Not Found) o altro
                throw new Error("Stanza non trovata o piena");
            }

            // La stanza esiste, navigo
            //Qui ci vorrà la connessione con socket.io
            navigate(`/match/${gameID}`);


        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };




    if (isCreating) {
        return (
            //Usa il contenitore definito in Home.css
            <div className="home-container">
                <h3>Crea la tua Partita</h3>
                <form onSubmit={handleSubmitNewGame}>
                    {/* 3. Usa la classe per i form (definita in Home.css) */}
                    <div className="form-group">
                        <label htmlFor='lobbyName'>Nome Stanza</label>
                        <input type='text'
                               id="lobbyName"
                               value={lobbyName}
                               onChange={(e) => setLobbyName(e.target.value)}
                               placeholder='Es. La Partita del cuore'
                               autoFocus
                        />
                    </div>

                    {/*Le classi per i bottoni */}
                    <div className="form-button-group">
                        <button type="submit" className='btn btn-primary'>Conferma</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>
                            Annulla
                        </button>
                    </div>
                </form>
            </div>
        )
    }

    // --- SCENA "UNISCITI A PARTITA" ---
    if (isJoining) {
        return (
            <div className="home-container">
                <h3>Entra in una Stanza</h3>
                <form onSubmit={handleSubmitJoinGame}>
                    <div className="form-group">
                        <label htmlFor='gameId'>ID Stanza</label>
                        <input type='text'
                               id="gameID"
                               value={gameID}
                               onChange={(e) => setGameID(e.target.value)}
                               placeholder='Es. C2929'
                               autoFocus
                        />
                    </div>

                    <div className="form-button-group">
                        <button type="submit" className='btn btn-primary'>Conferma</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setIsJoining(false)}>
                            Annulla
                        </button>
                    </div>
                </form>
            </div>
        )
    }

    // --- (Menu) ---
    return (
        <div className="home-container"> {/* 5. Usa lo stesso contenitore */}
            <h2>Ciao, {user.username}!</h2>
            <p>Cosa vuoi fare?</p>
            {/* 6. Classe specifica per il menu della lobby */}
            <div className="lobby-options">
                <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
                    Crea Partita
                </button>
                <button className="btn btn-secondary" onClick={() => setIsJoining(true)}>
                    Unisciti a una partita
                </button>
            </div>
        </div>
    );
}
export default Home;