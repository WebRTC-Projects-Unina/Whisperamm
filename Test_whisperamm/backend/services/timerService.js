// src/services/timerService.js
const NotificationService = require('./notificationService');
const PayloadUtils = require('../utils/gamePayloadUtils');
const GameService = require('./gameService'); // Per l'avanzamento di fase
const { Game } = require('../models/Game'); // Importa il model per scrivere su Redis

// GG: Ho bisogno di tenere traccia dei timer attivi per ogni stanza 
// inoltre non conviene a questo punto tenerli su Redis perché non sono dati critici
const activeTimers = new Map();

class TimerService {
    // 
    static async startTimedPhase(io, roomId, gameId, nextPhase, durationSeconds, onTimeoutCallback, extraPayload = {}) {
        // Pulisco il timer precedente per questa stanza se esistono
        this.clearTimer(roomId);

        // Calcola la scadenza
        const now = Date.now();
        const endTime = now + (durationSeconds * 1000);

        // 3. Aggiorna stato nel DB (Opzionale ma consigliato per riconnessioni)
        const updatedGame = await GameService.advancePhase(gameId, nextPhase);

        /// Aggiorniamo ANCHE il tempo di fine su Redis (per chi fa refresh della pagina)
        await Game.updateMetaField(gameId, 'phaseEndTime', endTime); //Da modificare questa

        // Costruzione Payload
        // Uniamo i dati base del gioco con i dati del timer E i dati extra
        const payload = {
            ...PayloadUtils.buildPublicGameData(updatedGame), // Dati base (players, round, etc)
            phase: nextPhase,       // Sovrascrittura esplicita per sicurezza
            endTime: endTime,       // Fondamentale per il timer frontend
            duration: durationSeconds,
            ...extraPayload         // <--- MODIFICA FONDAMENTALE: Inseriamo currentTurnIndex qui!
        };

        NotificationService.broadcastToRoom(io, roomId, 'phaseChanged', payload);

        // Imposta Timeout Server 
        const timeoutObj = setTimeout(async () => {
            this.clearTimer(roomId); // Rimuovi dalla mappa
            
            if (onTimeoutCallback) {
                await onTimeoutCallback();
            }
        }, durationSeconds * 1000);

        // Salva il riferimento per poterlo cancellare
        activeTimers.set(roomId, timeoutObj);
    }

    static clearTimer(roomId) {
        if (activeTimers.has(roomId)) {
            clearTimeout(activeTimers.get(roomId));
            activeTimers.delete(roomId);
            console.log(`[Timer] Cancellato timer per ${roomId}`);
        }
    }
}

module.exports = TimerService;