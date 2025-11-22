module.exports = (app) => {
    const roomController = require('../controllers/roomController');

    app.route('/api/createGame')
        .post(roomController.createGame);

    app.route('/api/game/checkGame/:gameId')
        .post(roomController.checkGame)
    
}

