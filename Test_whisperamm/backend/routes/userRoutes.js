module.exports = (app) => {
    const controller = require('../controllers/userController');

    app.route('/api/register')
        .post(controller.register);

    app.route('/api/createGame')
        .post(controller.createGame);

    app.route('/api/game/check/:gameId')
        .post(controller.checkGame);

    app.route('/api/me')
        .get(controller.getMe);
}