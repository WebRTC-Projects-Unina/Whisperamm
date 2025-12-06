const janusService = require('../services/janusService');
const roomService = require('../services/roomService');
const userService = require('../services/userService');

class JanusController {
    /**
     * Inizializza una sessione Janus per l'utente
     * POST /api/janus/session
     */
    static async initializeSession(req, res) {
        try {
            // Prova prima req.user.id (se autenticato), poi req.body.userId (dal frontend)
            const username = req.user?.username || req.body?.userId;  // ← Cambio: username

            if (!username) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated',
                });
            }

            console.log('🔵 Creating Janus session for username:', username);

            const result = await janusService.createSession(username);  // ← Passa username

            if (result.success) {
                return res.status(200).json({
                    success: true,
                    sessionId: result.sessionId,
                    message: 'Janus session created successfully',
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.error,
                });
            }
        } catch (error) {
            console.error('Error in initializeSession:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
            });
        }
    }

    /**
     * Attacca un handle al VideoRoom per una room specifica
     * POST /api/janus/attach-videoroom
     */
    static async attachVideoRoom(req, res) {
        try {
            const username = req.user?.username || req.body?.userId;  // ← Cambio
            const { roomId } = req.body;

            if (!username || !roomId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing username or roomId',
                });
            }

            console.log('🔵 Attaching VideoRoom for username:', username, 'roomId:', roomId);

            const janusSessionId = janusService.getSessionId(username);  // ← Passa username
            if (!janusSessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Janus session not found',
                });
            }

            const result = await janusService.attachVideoRoomHandle(
                janusSessionId,
                roomId
            );

            if (result.success) {
                return res.status(200).json({
                    success: true,
                    handleId: result.handleId,
                    message: 'VideoRoom handle attached successfully',
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.error,
                });
            }
        } catch (error) {
            console.error('Error in attachVideoRoom:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
            });
        }
    }

    /**
     * Invia un messaggio al plugin Janus
     * POST /api/janus/message
     */
    static async sendMessage(req, res) {
        try {
            const username = req.user?.username || req.body?.userId;  // ← Cambio
            const { body, jsep } = req.body;

            if (!username || !body) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                });
            }

            const janusSessionId = janusService.getSessionId(username);  // ← Passa username
            if (!janusSessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Janus session not found',
                });
            }

            const result = await janusService.sendMessage(
                janusSessionId,
                body.handleId,
                body,
                jsep
            );

            if (result.success) {
                return res.status(200).json({
                    success: true,
                    data: result.data,
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.error,
                });
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
            });
        }
    }

    /**
     * Distrugge la sessione Janus
     * POST /api/janus/destroy-session
     */
    static async destroySession(req, res) {
        try {
            const username = req.user?.username || req.body?.userId;  // ← Cambio

            if (!username) {
                return res.status(401).json({
                    success: false,
                    error: 'User not authenticated',
                });
            }

            console.log('🔵 Destroying Janus session for username:', username);

            const result = await janusService.destroySession(username);  // ← Passa username

            if (result.success) {
                return res.status(200).json({
                    success: true,
                    message: 'Janus session destroyed successfully',
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.error,
                });
            }
        } catch (error) {
            console.error('Error in destroySession:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
            });
        }
    }
}

module.exports = JanusController;