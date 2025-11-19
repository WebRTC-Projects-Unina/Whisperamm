// controllers/userController.js
const jwt = require('jsonwebtoken');
const { User, UserStatus } = require('../services/user'); //Da camb

const secret_jwt = process.env.SECRET_JWT;

const createToken = (id, username) => {
  return jwt.sign({ id, username }, secret_jwt, { expiresIn: '3h' });
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
    
    // Crea utente con stato iniziale offline
    const user = await User.create(validation.username, UserStatus.OFFLINE);
    
    const token = createToken(user.id, user.username);
    
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3 * 60 * 60 * 1000
    });
    
    console.log(`Utente registrato: ${user.username} (ID: ${user.id}, Status: ${user.status})`);
    
    res.status(201).json({
      message: 'Registrazione avvenuta con successo!',
      user: { 
        id: user.id,
        username: user.username,
        status: user.status
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
    const user = await User.findById(decoded.id);
    
    if (!user) {
      res.clearCookie('jwt');
      return res.status(401).json({ message: 'Utente non trovato' });
    }
    
    res.status(200).json({ 
      user: { 
        id: user.id, 
        username: user.username,
        status: user.status
      } 
    });
    
  } catch (err) {
    console.error('Errore in getMe:', err);
    
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token non valido o scaduto' });
    }
    
    return res.status(500).json({ message: 'Errore del server' });
  }
};

// Nuova route: aggiorna stato
exports.updateStatus = async (req, res) => {
  try {
    const token = req.cookies.jwt;
    if (!token) {
      return res.status(401).json({ message: 'Non autenticato' });
    }
    
    const decoded = jwt.verify(token, secret_jwt);
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Stato mancante' });
    }
    
    if (!User.isValidStatus(status)) {
      return res.status(400).json({ 
        message: `Stato non valido. Valori permessi: ${Object.values(UserStatus).join(', ')}` 
      });
    }
    
    await User.updateStatus(decoded.id, status);
    
    res.status(200).json({ 
      message: 'Stato aggiornato con successo',
      status 
    });
    
  } catch (err) {
    console.error('Errore in updateStatus:', err);
    return res.status(500).json({ message: 'Errore del server' });
  }
};

// Nuova route: lista utenti online
exports.getOnlineUsers = async (req, res) => {
  try {
    const onlineUsers = await User.findByStatus(UserStatus.ONLINE);
    
    res.status(200).json({
      count: onlineUsers.length,
      users: onlineUsers.map(u => ({
        id: u.id,
        username: u.username,
        status: u.status
      }))
    });
    
  } catch (err) {
    console.error('Errore in getOnlineUsers:', err);
    return res.status(500).json({ message: 'Errore del server' });
  }
};

// Nuova route: statistiche stati
exports.getStats = async (req, res) => {
  try {
    const stats = await User.getStatusStats();
    
    res.status(200).json({ stats });
    
  } catch (err) {
    console.error('Errore in getStats:', err);
    return res.status(500).json({ message: 'Errore del server' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('jwt');
  res.status(200).json({ message: 'Logout effettuato con successo' });
};