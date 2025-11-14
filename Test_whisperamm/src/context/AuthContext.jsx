import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // <-- Aggiunto stato di caricamento

    // Questo è il TUO codice, messo nel posto giusto!
    // Viene eseguito UNA VOLTA sola, all'avvio dell'app.
    useEffect(() => {
        const loadUserFromSession = async () => {
            try {
                const res = await fetch('http://localhost:8080/api/me', {
                    credentials: 'include', // Invia il cookie di sessione
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log(data.user);
                    setUser(data.user); // <-- ECCO! Popoliamo il Context
                } else {
                    // Non è un errore, solo l'utente non è loggato
                    setUser(null);
                }
            } catch (err) {
                console.error('Errore caricando /api/me:', err);
                setUser(null); // In caso di errore di rete, ecc.
            } finally {
                // In ogni caso, abbiamo finito di caricare
                setLoading(false);
            }
        };

        loadUserFromSession();
    }, []); // L'array vuoto [] significa "esegui solo al mount"

    // === Gestione Caricamento Iniziale ===
    // Finché non sappiamo se l'utente è loggato, non mostriamo l'app.
    // Questo evita il "flash" della pagina di registrazione.
    if (loading) {
        return <div>Caricamento...</div>; // O uno spinner
    }

    // Ora l'app può partire.
    // 'user' sarà l'utente (se c'era sessione) o 'null' (se non c'era).
    return (
        <AuthContext.Provider value={{ user, setUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);