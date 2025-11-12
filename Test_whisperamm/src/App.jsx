import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import Menu from './components/Menu';
import Match from './components/Match';

// Definisco le tue rotte
const router = createBrowserRouter([ // createBrowserRouter lo uso per matchare gli elementi alle possibili routes (URL) dell'applicazione.
    {
        path: "/", // URL principale
        element: <Menu />, // Mostra il Menu
    },
    {
        path: "/match/:gameId", // URL della partita con un ID dinamico
        element: <Match />, // Mostra il componente Match
    }
]);

// Gestisci il router alla tua App
function App() {
    return <RouterProvider router={router} />; // RouterProvider renderizza l'elemento associato alla route.
}

export default App;