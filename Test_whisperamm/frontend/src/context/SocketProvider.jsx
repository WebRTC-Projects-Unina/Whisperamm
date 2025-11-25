import React, { createContext, useContext, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

    // ✅ Funzione per creare la connessione (Singleton)
    const connectSocket = () => {
        // Se esiste già, non ne creiamo un'altra
        if (socket) return;

        console.log("🔌 [Provider] Inizializzazione connessione globale...");
        
        const newSocket = io('http://localhost:8080', {
            withCredentials: true,
            transports: ['websocket']
        });

        setSocket(newSocket);
    };

    // Funzione per chiudere
    const disconnectSocket = () => {
        if (socket) {
            console.log("🛑 [Provider] Disconnessione.");
            socket.disconnect();
            setSocket(null);
        }
    };

    return (
        <SocketContext.Provider value={{ socket, connectSocket, disconnectSocket }}>
            {children}
        </SocketContext.Provider>
    );
};