module.exports = (app) => {
    const userController = require('../controllers/userController');
    const roomController = require('../controllers/roomController');

    app.route('/api/register')
        .post(userController.register);
    
    app.route('/api/me')
        .get(userController.getMe);

    app.route('/api/createGame')
        .post(roomController.createGame);

    app.route('/api/game/checkGame/:gameId')
        .post(roomController.checkGameP)
        .get(roomController.checkGameG);
    
    
}

