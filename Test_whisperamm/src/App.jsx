import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Registrazione from './components/Registrazione'
import Lobby from './components/Lobby';
// Importo il provider
import { AuthProvider } from './context/AuthContext';

// Definisco le tue rotte
const router = createBrowserRouter([
    // createBrowserRouter lo uso per matchare gli elementi alle possibili routes (URL) dell'applicazione.
    {
        path: "/", // URL principale
        element: <Registrazione />, // Mostra il Menu
    },

    // Così com'è, se uno ha il link può entrare nella partita..però in teoria dovrebbe anche verificare che può entrarci nella partita.
    {
        path: "/match/:gameId", // URL della partita con un ID dinamico
        element: <Lobby/>, // Mostra il componente Match
    }
]);

// Gestisci il router in App
function App() {
    return (
        // 2. AVVOLGI IL ROUTERPROVIDER CON L'AUTHPROVIDER
        <AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider>
    );}

export default App;