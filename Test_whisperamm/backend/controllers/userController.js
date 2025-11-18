//Questi poi li sposto in server.js
const jwt = require('jsonwebtoken');    
const secret_jwt=process.env.SECRET_JWT;

const createToken = (id, username) => {
    //Problema: id ce lo dovrebbe dare il DB..
    //Dunque al momento tengo una struttura dati qui degli utenti attivi?
    //Appena poi implemento redis, che penso mi darà un ID una volta che aggiungo una entry, lo modifico e lo tolgo.
    return jwt.sign({id, username}, secret_jwt, { expiresIn: '3h' });
}

exports.register = (req, res) => {
    const { username } = req.body;

    // Manca la validazione username, anche con sanificazione dell'input.

    try{
        //Qui ci vuole l'inserimento in redis
        
        let id=crypto.randomUUID()
      
        const token = createToken(id,username); 
        res.cookie('jwt', token, {
            httpOnly: true,
            maxAge: 3 * 60 * 60 * 1000 // 3 ore
        });
         console.log(`Utente registrato: ${username} )`);
        //NOTA: Usa id temporaneo, poi appena metto db cambiamo.
    }catch(err){
        
        return res.status(500).json({message: 'Errore del server, riprova più tardi.'});
    }

    // Rimanda indietro l'utente registrato
    res.status(200).json({
        message: 'Registrazione avvenuta con successo!',
        user: { username: username },
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
        
        const decoded = jwt.verify(token, secret_jwt);
        res.status(200).json({ user: { id: decoded.id, username: decoded.username} });
    } catch (err) {
        return res.status(401).json({ message: 'Token non valido o scaduto' });
    }
  };