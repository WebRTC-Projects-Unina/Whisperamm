import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Registrazione from './components/Registrazione';
import Lobby from './components/Lobby';

// Importo i TRE provider
import { AuthProvider } from './context/AuthProvider';
import { SocketProvider } from './context/SocketProvider'; // <--- Importalo
import { JanusProvider } from './context/JanusProvider';

const router = createBrowserRouter([
    {
        path: "/",
        element: <Registrazione />
    },
    {
        path: "/match/:roomId",
        element: <Lobby/>
    }
]);

function App() {
    return (
        // LIVELLO 1: Gestisce "Chi sono" (User)
        <AuthProvider>
            
            {/* LIVELLO 2: Gestisce "La connessione" (Socket) */}
            {/* Nota: SocketProvider sta DENTRO AuthProvider perché ha bisogno di 'user' */}
            <SocketProvider>
            {/*LIVELLO 2.5: Gestisce "La connessione Janus" */}
                <JanusProvider>
                    {/* LIVELLO 3: Gestisce "Dove sono" (Pagine) */}
                    <RouterProvider router={router} />
                </JanusProvider>
            </SocketProvider>

        </AuthProvider>
    );
}

export default App;