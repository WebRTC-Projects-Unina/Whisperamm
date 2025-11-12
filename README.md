## Introduzione

Il progetto propone la realizzazione di una piattaforma web interattiva che consente a più utenti di partecipare a un gioco di gruppo ispirato a ‘Mister White’ in cui, stabilito un’ordine di gioco tramite un lancio dei dati, a turno, ogni giocatore dice un sinonimo della parola che ha deciso il primo in una fase iniziale e nel mentre tutti possono ascoltare ciò che il giocatore dice, fino ad arrivare all’ultimo giocatore che dovrà scrivere la parola che secondo lui è quella iniziale. Tutto questo in modalità completamente digitale e in tempo reale. 
L’applicazione sfrutta le tecnologie WebRTC e Janus Media Server per la comunicazione vocale, con sincronizzazione tramite WebSocket e interfaccia moderna sviluppata in React.js

## Descrizione funzionale

1. **Registrazione**: quando un utente accede all’applicazione, inserirà il nome con cui verrà riconosciuto in game.
2. **Creazione stanza**: un utente (admin) crea una stanza e configura numero utenti, password (opzionale se non si ha il codice di accesso diretto), round. Ottiene un codice o link univoco e può condividerlo con gli altri.
3. **Accesso partecipanti**: ogni utente può unirsi ad una stanza o tramite il codice/link, oppure accedendo ad una stanza pubblica.
4. **Connessione audio**: tutti i partecipanti di una stanza si connettono a una chiamata vocale di gruppo.
5. **Inizio partita:** gestito dall’admin tramite un pulsante o, se raggiunto il numero massimo di partecipanti della stanza scatta un time-out di 15 secondi, alla fine dei quali inizia la partita. 
6. **Lancio dei dadi**: ogni giocatore ha 15 secondi per lanciare i dadi mediante un pulsante, altrimenti questo avviene in automatico, per determinare l’ordine di gioco.
7. **Fase di gioco 1** : in ogni turno, il primo giocatore comunica al sistema la parola del round. 
8. **Fase di gioco 2:** il player 1 comunica un sinonimo della parola vocalmente alla stanza, e così fino all’ultimo player.
9. **Fase di gioco 3**: l’ultimo player scrive la parola in un apposita casella di testo e il sistema la mostra agli altri giocatori.
10. **Dashboard finale**: alla fine del round, viene mostrata una dashboard che confronta la parola iniziale con quella finale e calcola un punteggio.

## Tecnologie che useremo

- Frontend: **React.js**.
- Backend: **Node.js con Express.js, Socket.IO**.
- Media Server: **Janus WebRTC Gateway** per la gestione dei flussi audio multipli.
- Comunicazione real-time: **?**
- Database (forse): in-memory o JSON per salvataggio temporaneo delle partite.