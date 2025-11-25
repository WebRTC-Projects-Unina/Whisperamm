import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Registrazione from './components/Registrazione'
import Lobby from './components/Lobby';
// Importo il provider
import { AuthProvider} from './context/AuthProvider';

// Definisco le rotte che verranno gestite dal componente di ReactV6: RouterProvider
const router = createBrowserRouter([
    {
        path: "/", // URL principale
        element: <Registrazione />, // Mostra il Menu
    },

    //Se uno ha il link può entrare nella partita..DEVE ESSERE REGISTRATO
    {
        path: "/match/:roomId", // URL della partita con un ID dinamico
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