import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const useLobbyValidation = (roomId, user) => {
    const navigate = useNavigate();
    const [isValidating, setIsValidating] = useState(!!user);
    const [lobbyError, setLobbyError] = useState(null);
    const [roomName, setRoomName] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(null);
    const [adminPlayer, setAdminPlayer] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        let ignore = false;

        if (!roomId) {
            setLobbyError("ID partita non trovato.");
            setIsValidating(false);
            return;
        }

        if (!user) {
            setIsValidating(false);
            setLobbyError(null);
            return;
        }

        //Definizione
        const checkLobby = async () => {
            setIsValidating(true);  
            setLobbyError(null);

            try {
                const response = await fetch(`/api/game/checkRoom/${roomId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user })
                });

                const data = await response.json();
                if (ignore) return;

                if (!response.ok) {
                    if (response.status === 404) setLobbyError(data.message || "Stanza non trovata.");
                    else if (response.status === 403) setLobbyError(data.message || "La stanza è piena.");
                    else setLobbyError(data.message || "Errore sconosciuto.");
                } else {
                    setLobbyError(null);
                    setRoomName(data.roomName || '');
                    setMaxPlayers(data.maxPlayers || null);
                    setAdminPlayer(data.host);
                    if(user.username === data.host) setIsAdmin(true);
                }

            } catch (err) {
                if (!ignore) {
                    console.error("Errore fetch:", err);
                    setLobbyError("Impossibile connettersi al server.");
                }
            } finally {
                if (!ignore) setIsValidating(false);
            }
        };

        //Chiamata
        checkLobby();
        return () => {ignore = true;};

    }, [user, roomId]);

    useEffect(() => {
        if (lobbyError) {
            const timer = setTimeout(() => navigate('/'), 2000); 
            return () => clearTimeout(timer);
        }
    }, [lobbyError, navigate]);

    return { 
        isValidating, 
        setIsValidating,
        lobbyError, 
        setLobbyError,
        roomName, 
        setRoomName,
        maxPlayers, 
        setMaxPlayers,
        adminPlayer, 
        setAdminPlayer,
        isAdmin, 
        setIsAdmin 
    };
};