// controllers/userController.js
const jwt = require('jsonwebtoken');
const { User, UserStatus } = require('../services/user');

const secret_jwt = process.env.SECRET_JWT;

// Aggiunta (richiede npm install uuid)
const { v4: uuidv4 } = require('uuid'); 

// Modifica di createToken
const createToken = (username) => {
  // Questo rende il token unico per ogni sessione
  const jti = uuidv4(); 
  
  // Il payload conterrà { username: '...', jti: '...' }
  return jwt.sign({ username, jti }, secret_jwt, { expiresIn: '3h' });
};

const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username mancante' };
  }
  
  username = username.trim();
  
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username deve essere tra 3 e 20 caratteri' };
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username può contenere solo lettere, numeri e underscore' };
  }
  
  return { valid: true, username };
};

exports.register = async (req, res) => {
  try {
    const { username } = req.body;
    
    const validation = validateUsername(username);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.error });
    }
    
    // Crea utente con stato iniziale ONLINE
    const createdUsername = await User.create(validation.username, UserStatus.ONLINE);
    
    // Crea token con username, poi ci sarà l'id del token semplicemente che varia, ma non lo salviamo
    const token = createToken(createdUsername);
    
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 60 * 60 * 1000
    });
    
    console.log(`Utente registrato: ${createdUsername} (Status: ${UserStatus.ONLINE})`);
    
    res.status(201).json({
      message: 'Registrazione avvenuta con successo!',
      user: { 
        username: createdUsername,
        status: UserStatus.ONLINE
      }
    });
    
  } catch (err) {
    console.error('Errore durante registrazione:', err);
    
    if (err.message === 'Username già esistente') {
      return res.status(409).json({ message: err.message });
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
    
    const decoded = jwt.verify(token, secret_jwt);
    
    if (!decoded.username) {
      return res.status(401).json({ message: 'Token non valido' });
    }
    
    const username = decoded.username;
    const user = await User.get(username);
    
    if (!user) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }
    
    res.status(200).json({ 
      user: { 
        username: user.username,
        status: user.status
      } 
    });
    
  } catch (err) {
    console.error('Errore in getMe:', err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Token non valido' });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token scaduto' });
    }
    
    return res.status(500).json({ message: 'Errore del server' });
  }
};