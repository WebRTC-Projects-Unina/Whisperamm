module.exports = (app) => {
    const roomController = require('../controllers/roomController');

    app.route('/api/createRoom')
        .post(roomController.createRoom);

    app.route('/api/game/checkRoom/:gameId')
        .post(roomController.checkRoom)
    
}

