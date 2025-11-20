import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    //Al momento user contiene {username,id}, in futuro vediamo se togliere id.

    // Eseguito solo al mount, all'avvio dell'app dunque.
    useEffect(() => {
        const loadUserFromSession = async () => {
            try {
                const res = await fetch('http://localhost:8080/api/me', {
                    credentials: 'include', // Invia il cookie di sessione
                    //Con 'include' invia il Cookie sessioni
                    //'same-origin' se front e back sono sullo stesso dominio
                });

                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user); // Popoliamo il Context se l'utente è loggato
                } else {
                    setUser(null); // Non loggato
                }
            } catch (err) {
                console.error('Errore caricando /api/me:', err);
                setUser(null); // In caso di errore di rete, ecc.
            } finally {
                // In ogni caso, abbiamo finito di caricare il contesto, 
                // sia in caso affermativo che negativo.
                setLoading(false);
            }
        };
/*
 *   Sopra l'ho definita e adesso la chiamo
 * useEffect non può essere async, quindi definisco una funzione async dentro 
 *   e la chiamo subito dopo.        
*/
        loadUserFromSession();
    }, []);

    // === Gestione Caricamento Iniziale ===
    // Finché non sappiamo se l'utente è loggato, non mostriamo ancora l'app.
    if (loading) {
        return <div>Caricamento...</div>; // O uno spinner
    }

    // Ora l'app può partire. 'user' sarà l'utente (se c'era sessione) o 'null' (se non c'era).
    return (
        <AuthContext.Provider value={{ user, setUser }}>
            {children}
        </AuthContext.Provider>
    );
};

//useAuth è un custom hook per usare il context più facilmente
export const useAuth = () => useContext(AuthContext);