module.exports = (app) => {
    const JanusController = require('../controllers/JanusController');

    app.route('/api/janus/session')
        .post(JanusController.initializeSession);
    
    app.route('/api/janus/attach-videoroom')
        .post(JanusController.attachVideoRoom);

    app.route('/api/janus/message')
        .post(JanusController.sendMessage);

    app.route('/api/janus/destroy-session')
        .post(JanusController.destroySession);

    app.route('/api/janus/join-room')
        .post(JanusController.joinVideoRoom);
}