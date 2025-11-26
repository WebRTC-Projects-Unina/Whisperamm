// controllers/userController.js
const UserService = require('../services/userService');

exports.register = async (req, res) => {
  try {
    const { username } = req.body;
    
    const result = await UserService.registerUser(username);
    
    res.cookie('jwt', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 60 * 60 * 1000
    });

    console.log(`Utente registrato: ${result.username} (Status: ${result.status})`);

    res.status(201).json({
      message: 'Registrazione avvenuta con successo!',
      user: {
        username: result.username,
        status: result.status
      }
    });
  } catch (err) {
    console.error('Errore durante registrazione:', err);
    
    if (err.message === 'USERNAME_EXISTS') {
      return res.status(409).json({ message: 'Username già esistente' });
    }
    
    if (err.message.includes('Username')) {
      return res.status(400).json({ message: err.message });
    }
    
    return res.status(500).json({ message: 'Errore del server, riprova più tardi.' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const token = req.cookies.jwt;
    
    if (!token) {
      return res.status(401).json({ message: 'Non autenticato' });
    }

    const user = await UserService.getAuthenticatedUser(token);

    res.status(200).json({
      user: {
        username: user.username,
        status: user.status
      }
    });
  } catch (err) {
    console.error('Errore in getMe:', err);
    
    if (err.message === 'TOKEN_INVALID') {
      return res.status(401).json({ message: 'Token non valido' });
    }
    
    if (err.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({ message: 'Token scaduto' });
    }
    
    if (err.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ message: 'Utente non trovato' });
    }
    
    return res.status(500).json({ message: 'Errore del server' });
  }
};


/*
/models
  └── User.js              # Accesso ai dati (Redis)

/services
  └── userService.js       # Logica di business

/controllers
  └── userController.js    # Gestione richieste HTTP

/routes
  └── userRoutes.js        # Definizione route
*/