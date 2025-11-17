const { validateUsername } = require('../utils/validators');

exports.register = (req, res) => {
    console.log(req.body);
    const { username } = req.body;

    const result = validateUsername(username);
    if (!result.valid) {
        console.log("Username non valido");
        return res.status(400).json({ message: result.message });
    }

    // La logica della sessione funziona ESATTAMENTE come prima
    // perché 'req' è lo stesso oggetto
    req.session.user = { //
        id: req.session.id,
        username: username.trim()
    };

    console.log(`Utente registrato: ${username} (ID: ${req.session.user.id})`);

    // Rimanda indietro l'utente registrato
    res.status(200).json({
        message: 'Registrazione avvenuta con successo!',
        user: req.session.user
    });
}



exports.getMe = (req, res) => {
    if (!req.session || !req.session.user) {
        //controlla se esiste
        return res.status(401).json({ error: 'Non autenticato' });
    }
    res.json({ user: req.session.user });
  };