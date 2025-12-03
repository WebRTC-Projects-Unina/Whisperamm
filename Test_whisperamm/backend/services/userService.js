// services/userService.js
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, UserStatus } = require('../models/User');

const SECRET_JWT = process.env.SECRET_JWT;

class UserService {
  // Validazione, da aggiungere controlli su caratteri speciali ecc.
  static validateUsername(username) {
    if (!username || typeof username !== 'string') {
      throw new Error('Username mancante');
    }

    username = username.trim();

    if (username.length < 3 || username.length > 20) {
      throw new Error('Username deve essere tra 3 e 20 caratteri');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Username può contenere solo lettere, numeri e underscore');
    }

    return username;
  }

  // Creazione token
  static createToken(username) {
    const jti = uuidv4();
    return jwt.sign({ username, jti }, SECRET_JWT, { expiresIn: '3h' });
  }

  // Verifica token
  static verifyToken(token) {
    try {
      return jwt.verify(token, SECRET_JWT);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new Error('TOKEN_EXPIRED');
      }
      throw new Error('TOKEN_INVALID');
    }
  }

  // Registrazione utente
  static async registerUser(username) {
    const validatedUsername = this.validateUsername(username);
    
    const createdUsername = await User.create(validatedUsername, UserStatus.ONLINE);
    
    if (!createdUsername) {
      throw new Error('USERNAME_EXISTS');
    }

    const token = this.createToken(createdUsername);
    
    return {
      username: createdUsername,
      status: UserStatus.ONLINE,
      token
    };
  }

  // Recupero utente autenticato
  static async getAuthenticatedUser(token) {
    const decoded = this.verifyToken(token);
    
    if (!decoded.username) {throw new Error('TOKEN_INVALID');}

    const user = await User.get(decoded.username);
    
    if (!user) {throw new Error('USER_NOT_FOUND');}

    return user;
  }

  // Verifica se un utente esiste
  static async userExists(username) {
    return await User.exists(username);
  }

  //Per aggiornare in Game o Online.
  static async updateStatus(username, newStatus){
    User.updateStatus(username,newStatus)
  }

  // Imposta lo stato di più utenti
 static async setMultipleUsersStatus(usernames, status) {
        // Possiamo farlo in parallelo o con un loop
        const promises = usernames.map(username => 
            User.updateStatus(username, status) // Assumendo che User.updateStatus esista
        );
        await Promise.all(promises);
  }

  // Imposta lo stato di un utente
  static async setUserStatus(username, status) {
    const exists = await User.exists(username);
    if (!exists) {
      throw new Error('USER_NOT_FOUND');
    }
    await User.updateStatus(username, status);
  }

  

  // Imposta lo stato ready dell'utente
  static async setUserReady(username, state) {
    const exists = await User.exists(username);
    if (!exists) {
      throw new Error('USER_NOT_FOUND');
    }
    
    await User.setReady(username, state);
  }

  // Ottiene lo stato ready di un utente
  static async getUserReady(username) {
    const user = await User.get(username);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    return user.isready;
  }

  // Ottiene lo stato ready di più utenti
  static async getMultipleUsersReady(usernames) {
    const readyStates = {};
    
    for (const username of usernames) {
      try {
        const isReady = await this.getUserReady(username);
        readyStates[username] = isReady;
      } catch (err) {
        readyStates[username] = false; // Default se utente non trovato
      }
    }
    
    return readyStates;
  }
}

module.exports = UserService;
module.exports.UserStatus = UserStatus; //Per evitare di importare User in Room..