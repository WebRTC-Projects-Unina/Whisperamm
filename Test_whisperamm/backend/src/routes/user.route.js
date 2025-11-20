const userController = require('../controllers/user.controller');
const express = require('express');
const router = express.Router();

    router.post('/register', userController.register);

    router.get('/me', userController.getMe);
    
module.exports = router;


