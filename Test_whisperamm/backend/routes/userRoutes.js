module.exports = (app) => {
    const userController = require('../controllers/userController');

    app.route('/api/register')
        .post(userController.register);
    
    app.route('/api/me')
        .get(userController.getMe);
        
}

