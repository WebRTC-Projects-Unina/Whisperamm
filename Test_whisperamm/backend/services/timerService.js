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
    static async startTimedPhase(io, roomId, gameId, nextPhase, durationSeconds, onTimeoutCallback) {
        // Pulisco il timer precedente per questa stanza se esistono
        this.clearTimer(roomId);

        // Calcola la scadenza
        const now = Date.now();
        const endTime = now + (durationSeconds * 1000);

        // 3. Aggiorna stato nel DB (Opzionale ma consigliato per riconnessioni)
        // await GameService.updateMetaField(gameId, 'phaseEndTime', endTime);
        // await GameService.updateMetaField(gameId, 'phase', nextPhase); 
        // (Nota: Assumiamo che la fase sia già settata o la settiamo qui)
        const updatedGame = await GameService.advancePhase(gameId, nextPhase);

        // Costruisci payload per notificare gli user
        const payload = PayloadUtils.buildPublicGameData(updatedGame);
        payload.endTime = endTime; // Aggiungiamo il tempo
        payload.duration = durationSeconds; // Utile per progress bar (frontend)

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