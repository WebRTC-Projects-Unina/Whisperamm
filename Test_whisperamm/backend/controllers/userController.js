const { validateUsername } = require('../utils/validators');
//Questi poi li sposto in server.js
const jwt = require('jsonwebtoken');    


const createToken = (id, username) => {
    //Problema: id ce lo dovrebbe dare il DB..
    //Dunque al momento tengo una struttura dati qui degli utenti attivi?
    //Appena poi implemento redis, che penso mi darà un ID una volta che aggiungo una entry, lo modifico e lo tolgo.
    return jwt.sign({id, username}, 'Segretissimostosegreto', { expiresIn: '3h' });
}

exports.register = (req, res) => {
    const { username } = req.body;
    let id=crypto.randomUUID() // Ho spostato id qua sennò non va niente in Lobby, quando mettiamo
                                                        // solo user e cambiamo tutto non dovrebbe dare problemi

    const result = validateUsername(username);
    if (!result.valid) {
        console.log("Username non valido");
        return res.status(400).json({ message: result.message });
    }

    try{
        //Qui ci vuole l'inserimento in redis
        const token = createToken(id,username); 
        res.cookie('jwt', token, {
            httpOnly: true,
            maxAge: 3 * 60 * 60 * 1000 // 3 ore
        });
         console.log(`Utente registrato: ${username} ${id} )`);
        //NOTA: Usa id temporaneo, poi appena metto db cambiamo.
    }catch(err){
        
        return res.status(500).json({message: 'Errore del server, riprova più tardi.'});
    }

    // Rimanda indietro l'utente registrato
    res.status(200).json({
        message: 'Registrazione avvenuta con successo!',
        user: { username: username, id: id },
    });
}



exports.getMe = (req, res) => {
    // Estrai il token dai cookie
    const token = req.cookies.jwt;
    if (!token) {
        return res.status(401).json({ message: 'Non autenticato' });
    }
    try {
        // Verifica il token
        
        const decoded = jwt.verify(token, 'Segretissimostosegreto');
        res.status(200).json({ user: { id: decoded.id, username: decoded.username} });
    } catch (err) {
        return res.status(401).json({ message: 'Token non valido o scaduto' });
    }
  };