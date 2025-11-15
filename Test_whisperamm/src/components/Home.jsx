import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';

// --- MODIFICA QUI ---
// 2. Rimuovi '{ user }' dalle props. Il componente non lo riceve più.
const Home = () => {
// --- FINE MODIFICA ---

    // Prendiamo 'user' direttamente dal context
    const { user } = useAuth();

    //Stati
    const [isJoining, setIsJoining] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    // Stati per la partita
    const [lobbyName, setLobbyName] = useState('');
    const [gameID, setGameID] = useState('');
    const [maxPlayers, setMaxPlayers] = useState('');
    const [rounds, setRounds] = useState('');

    const [error, setError] = useState(null); // Stato per gli errori

    const navigate = useNavigate();

    const handleShowCreate = () => {
        setError(null); // <-- Pulisci l'errore
        setIsCreating(true);
    };

    const handleShowJoin = () => {
        setError(null); // <-- Pulisci l'errore
        setIsJoining(true);
    };

    const handleSubmitNewGame = async (e) => {
        e.preventDefault();
        if (lobbyName.length < 3) {
            if (lobbyName.length < 3) {
                setError("Il nome della stanza è troppo corto");
            }
            return;
        }

        try {
            console.log("Famo arriva sta richiestina..")
            const response = await fetch('/api/createGame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: lobbyName, user: user, maxPlayers: maxPlayers, rounds: rounds })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Errore durante la creazione');
            }

            console.log("Stanza creata, ID:", data.roomId);
            navigate(`/match/${data.roomId}`);

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    const handleSubmitJoinGame = async (e) => {
        e.preventDefault();
        if (gameID.length < 3) {
            setError("L'ID della stanza è troppo corto");
            return;
        }

        try {
            const response = await fetch(`/api/game/checkGame/${gameID}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: user }) // <-- 'user' è disponibile
            });

            console.log(response);
            if (!response.ok) {
                throw new Error("Stanza non trovata o piena");
            }

            navigate(`/match/${gameID}`);

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };


    // AGGIUNGIAMO UN CONTROLLO DI SICUREZZA
    if (!user) {
        return <p>Errore: utente non trovato. Ritorna alla pagina di login.</p>
    }

    // SCENA "CREA PARTITA"
    if (isCreating) {
        return (
        //Usa il contenitore definito in Home.css
            <div className="home-container">
                <h3>Crea la tua Partita</h3>
                {error && (
                    <div className="form-error-message">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmitNewGame}>
                    <div className="form-group">
                        {/*Nome stanza */}
                        <label htmlFor='lobbyName'>Nome Stanza</label>
                        <input type='text'
                               id="lobbyName"
                               value={lobbyName}
                               onChange={(e) => setLobbyName(e.target.value)}
                               placeholder='Es. La Partita del cuore'
                               autoFocus
                        />

                        {/* Numero di giocatori */}
                        <label htmlFor='maxPlayers'>Numero di giocatori</label>
                        <select
                            id="maxPlayers"
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(e.target.value)}
                            required
                            className="select-placeholder"
                        >
                            <option value="" disabled>Seleziona (da 2 a 12)</option>
                            {
                                // Crea un array da 2 a 12
                                Array.from({ length: 11 }, (_, i) => i + 2).map(num => (
                                    <option key={num} value={num}>
                                        {num} giocatori
                                    </option>
                                ))
                            }
                        </select>

                        {/* Numero rounds */}
                        <label htmlFor='rounds'>Numero di round</label>
                        <select
                            id="rounds"
                            value={rounds}
                            onChange={(e) => setRounds(e.target.value)}
                            required
                            className="select-placeholder"
                        >
                            <option value="" disabled>Seleziona (da 1 a 10)</option>
                            {
                                // Crea un array da 1 a 10
                                Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                                    <option key={num} value={num}>
                                        {num} {num === 1 ? 'round' : 'rounds'}
                                    </option>
                                ))
                            }
                        </select>
                    </div>

                    {/*Le classi per i bottoni (rimane invariato)*/}
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
                {error && (
                    <div className="form-error-message">
                        {error}
                    </div>
                )}
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

    // ---Menu---
    return (
        <div className="home-container">
            <h2>Ciao, {user.username}!</h2> {/* <-- 'user' è disponibile */}
            <p>Cosa vuoi fare?</p>
            <div className="lobby-options">
                <button className="btn btn-primary" onClick={handleShowCreate}>
                    Crea Partita
                </button>
                <button className="btn btn-secondary" onClick={handleShowJoin}>
                    Unisciti a una partita
                </button>
            </div>
        </div>
    );
}
export default Home;