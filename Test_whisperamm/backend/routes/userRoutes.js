module.exports = (app) => {
    const userController = require('../controllers/userController');
    const gameController = require('../controllers/gameController');

    app.route('/api/register')
        .post(userController.register);

    app.route('/api/createGame')
        .post(gameController.createGame);

    app.route('/api/game/checkGame/:gameId')
        .post(gameController.checkGameP)
        .get(gameController.checkGameG);

    app.route('/api/me')
        .get(userController.getMe);
}

