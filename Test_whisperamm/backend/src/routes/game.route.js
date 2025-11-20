const gameController = require('../controllers/game.controller');
const express = require('express');
const router = express.Router();

router.post('/createGame', gameController.createGame);

router.route('/checkGame/:gameId')
    .post(gameController.checkGameP)
    .get(gameController.checkGameG);

module.exports = router;
