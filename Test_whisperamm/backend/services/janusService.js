const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class JanusService {
    constructor() {
        this.janusUrl = process.env.JANUS_URL || 'http://localhost:8088/janus';
        this.sessions = new Map(); // username -> janusSessionId
        this.handles = new Map(); // username -> handleId
    }

    /**
     * Crea una nuova sessione Janus
     */
    async createSession(username) {
        try {
            const response = await fetch(`${this.janusUrl}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    janus: 'create',
                    transaction: this.generateTransaction(),
                }),
            });

            const data = await response.json();
            
            if (data.janus === 'success') {
                const janusSessionId = data.data.id;
                this.sessions.set(username, janusSessionId);
                console.log(`✅ Janus session created for ${username}: ${janusSessionId}`);
                return { success: true, sessionId: janusSessionId, username };
            } else {
                throw new Error(`Janus error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error creating Janus session:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Attacca un handle al plugin VideoRoom
     */
    async attachVideoRoomHandle(janusSessionId, roomId, username) {
        try {
            const response = await fetch(
                `${this.janusUrl}/${janusSessionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        janus: 'attach',
                        plugin: 'janus.plugin.videoroom',
                        transaction: this.generateTransaction(),
                    }),
                }
            );

            const data = await response.json();

            if (data.janus === 'success') {
                const handleId = data.data.id;
                this.handles.set(username, handleId);
                console.log(`✅ VideoRoom handle attached for ${username}: ${handleId}`);
                return { success: true, handleId };
            } else {
                throw new Error(`Janus error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error attaching VideoRoom handle:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Join a VideoRoom
     */
    async joinVideoRoom(janusSessionId, handleId, roomId, username, display) {
        try {
            const response = await fetch(
                `${this.janusUrl}/${janusSessionId}/${handleId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        janus: 'message',
                        body: {
                            request: 'join',
                            ptype: 'publisher',
                            room: roomId,
                            id: Date.now(), // Identificativo univoco
                            display: display || username,
                        },
                        transaction: this.generateTransaction(),
                    }),
                }
            );

            const data = await response.json();

            if (data.janus === 'success' || data.janus === 'ack') {
                console.log(`✅ Joined VideoRoom for ${username}`);
                return { success: true, data };
            } else {
                throw new Error(`Janus error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error joining VideoRoom:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Invia un messaggio al plugin Janus (SDP offer/answer)
     */
    async sendMessage(janusSessionId, handleId, body, jsep = null) {
        try {
            const payload = {
                janus: 'message',
                body: body,
                transaction: this.generateTransaction(),
            };

            if (jsep) {
                payload.jsep = jsep;
            }

            const response = await fetch(
                `${this.janusUrl}/${janusSessionId}/${handleId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();

            if (data.janus === 'success' || data.janus === 'ack') {
                return { success: true, data };
            } else {
                throw new Error(`Janus error: ${data.error}`);
            }
        } catch (error) {
            console.error('Error sending message to Janus:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Distrugge una sessione Janus
     */
    async destroySession(username) {
        try {
            const janusSessionId = this.sessions.get(username);
            
            if (!janusSessionId) {
                console.warn(`⚠️ Session not found for ${username}`);
                return { success: false, error: 'Session not found' };
            }

            const response = await fetch(
                `${this.janusUrl}/${janusSessionId}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        janus: 'destroy',
                        transaction: this.generateTransaction(),
                    }),
                }
            );

            const data = await response.json();
            this.sessions.delete(username);
            this.handles.delete(username);
            console.log(`✅ Janus session destroyed for ${username}`);

            return { success: data.janus === 'success' };
        } catch (error) {
            console.error('Error destroying Janus session:', error);
            return { success: false, error: error.message };
        }
    }

    generateTransaction() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let transaction = '';
        for (let i = 0; i < 12; i++) {
            transaction += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return transaction;
    }

    getSessionId(username) {
        return this.sessions.get(username) || null;
    }

    getHandleId(username) {
        return this.handles.get(username) || null;
    }
}

module.exports = new JanusService();