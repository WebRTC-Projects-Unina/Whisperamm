import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import '../style/Home.css';

const Home = () => {
    
    // Prendiamo 'user' direttamente dal context
    const { user } = useAuth();

    //Stati
    const [isJoining, setIsJoining] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    // Stati per la partita
    const [lobbyName, setLobbyName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [maxPlayers, setMaxPlayers] = useState('');
    const [rounds, setRounds] = useState('');
    const [error, setError] = useState(null); // Stato per gli errori

    const [openMenu, setOpenMenu] = useState(null);

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
            
            const response = await fetch('/api/createGame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: lobbyName, user: user, maxPlayers: maxPlayers, rounds: rounds })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Errore durante la creazione');
            }

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

        // Mandiamo una POST per controllare l'esistenza della stanza e la possibilità di entrare
        try {
            const response = await fetch(`/api/game/checkRoom/${roomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user })
            });

            const data = await response.json(); 
            
            if (!response.ok) {
                // Gestione errori...
                if (response.status === 404) {
                    throw new Error("Stanza non trovata.");
                } else if (response.status === 403) {
                    throw new Error("La stanza è piena.");
                } else {
                    throw new Error("Errore sconosciuto.");
                }
            }else{
                // Se tutto va bene, reindirizza alla pagina della partita
                //Qui forse user malevolo potrebbe accedere anche se non esiste, togliendo il check sulla response.ok
                navigate(`/match/${roomId}`);
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    // Funzione helper per chiudere i menu se clicchi fuori (opzionale ma utile)
    const toggleMenu = (menuName) => {
        if (openMenu === menuName) {
            setOpenMenu(null); // Chiudi se è già aperto
        } else {
            setOpenMenu(menuName); // Apri quello cliccato
        }
    };

    // Questo effetto ascolta ogni click sulla pagina.
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Se c'è un menu aperto...
            if (openMenu) {
                // ...e il punto cliccato NON è dentro un nostro menu a tendina...
                if (!event.target.closest('.custom-select-wrapper')) {
                    setOpenMenu(null); // ...allora chiudi il menu!
                }
            }
        };

        // Attiva l'ascoltatore
        document.addEventListener('mousedown', handleClickOutside);
        
        // Disattiva quando cambi pagina (pulizia)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [openMenu]);

    // AGGIUNGIAMO UN CONTROLLO DI SICUREZZA
    if (!user) {
        return <p>Errore: utente non trovato. Ritorna alla pagina di login.</p>
    }

    // --- SCENA "CREA PARTITA" ---
    if (isCreating) {
        return (
            <div className="home-wrapper">
                <div className="home-container giant-circle">
                    <h3>Crea Partita</h3>
                    
                    <form onSubmit={handleSubmitNewGame}>
                        <div className="form-group scrollable-group">
                            
                            {/* INPUT NOME (Resta uguale) */}
                            <label htmlFor='lobbyName'>NOME STANZA</label>
                            <input type='text'
                                id="lobbyName"
                                value={lobbyName}
                                onChange={(e) => setLobbyName(e.target.value)}
                                placeholder='Es. Partita del Cuore'
                            />

                            {/* --- MENU PERSONALIZZATO: GIOCATORI --- */}
                            <label>GIOCATORI</label>
                            <div className="custom-select-wrapper">
                                {/* Il "Bottone" che mostra cosa hai scelto */}
                                <div 
                                    className={`select-trigger ${openMenu === 'players' ? 'open' : ''}`}
                                    onClick={() => toggleMenu('players')}
                                >
                                    {maxPlayers ? `${maxPlayers} giocatori` : "Seleziona"}
                                </div>

                                {/* La Lista che appare solo se aperta */}
                                {openMenu === 'players' && (
                                    <div className="options-list">
                                        {Array.from({ length: 10 }, (_, i) => i + 2).map(num => (
                                            <div 
                                                key={num} 
                                                className={`option-item ${maxPlayers == num ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setMaxPlayers(num);
                                                    setOpenMenu(null); // Chiude il menu dopo la scelta
                                                }}
                                            >
                                                {num} giocatori
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- MENU PERSONALIZZATO: ROUNDS --- */}
                            <label>ROUNDS</label>
                            <div className="custom-select-wrapper">
                                <div 
                                    className={`select-trigger ${openMenu === 'rounds' ? 'open' : ''}`}
                                    onClick={() => toggleMenu('rounds')}
                                >
                                    {rounds ? `${rounds} ${rounds == 1 ? 'round' : 'rounds'}` : "Seleziona"}
                                </div>

                                {openMenu === 'rounds' && (
                                    <div className="options-list">
                                        {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                                            <div 
                                                key={num} 
                                                className={`option-item ${rounds == num ? 'selected' : ''}`}
                                                onClick={() => {
                                                    setRounds(num);
                                                    setOpenMenu(null);
                                                }}
                                            >
                                                {num} {num === 1 ? 'round' : 'rounds'}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                        
                        {error && <div className="form-error-message">{error}</div>}

                        <div className="form-button-group">
                            <button type="submit" className='btn btn-primary'>Conferma</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>
                                Annulla
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    // --- SCENA "UNISCITI A PARTITA" ---
    if (isJoining) {
        return (
            <div className="home-wrapper">
                <div className="home-container">
                    <h3>Unisciti</h3>
                    
                    <form onSubmit={handleSubmitJoinGame}>
                        <div className="form-group">
                            <label htmlFor='roomId'>ID STANZA</label>
                            <input type='text'
                                   id="roomId"
                                   value={roomId}
                                   onChange={(e) => setRoomId(e.target.value)}
                                   placeholder='Es. C1CC10'
                            />
                        </div>

                        {error && <div className="form-error-message">{error}</div>}

                        <div className="form-button-group">
                            <button type="submit" className='btn btn-primary'>Conferma</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setIsJoining(false)}>
                                Annulla
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    // --- MENU PRINCIPALE ---
    return (
        <div className="home-wrapper">
            <div className="home-container main-menu">
                <h2>Ciao {user.username}!</h2>
                <div className="lobby-options">
                    <button className="btn btn-primary" onClick={handleShowCreate}>
                        Crea Partita
                    </button>
                    <button className="btn btn-primary" onClick={handleShowJoin}>
                        Unisciti
                    </button>
                </div>
            </div>
        </div>
    );
}
export default Home;