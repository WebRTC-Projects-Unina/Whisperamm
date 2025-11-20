/*
Faccio solo la validazione delle stringhe username e roomName perchè penso che basti, siccome
alcuni controlli di validazione servono per attacchi come SQL Injection o XSS
e in questo caso non ha senso sanificare, ma solo rifiutare l'input
*/


/*
Validator generico per stringhe tipo username / roomName
*/
function createStringValidator({ fieldLabel, min, max }) {
    return function (value) {
        if (typeof value !== 'string') {
            return { valid: false, message: `${fieldLabel} obbligatorio e deve essere una stringa.` };
        }

        const trimmed = value.trim();
        console.log(`Validating ${fieldLabel}: "${trimmed}" (length: ${trimmed.length})`);
        if (trimmed.length < min || trimmed.length > max) {
            return {
                valid: false,
                message: `${fieldLabel} non valido. Deve avere tra ${min} e ${max} caratteri.`
            };
        }

        if (/\s{2,}/.test(trimmed)) {
            return {
                valid: false,
                message: `${fieldLabel} non valido. Non sono ammessi spazi consecutivi.`
            };
        }

        const regex = /^[A-Za-z0-9 _-]+$/;
        if (!regex.test(trimmed)) {
            return {
                valid: false,
                message: `${fieldLabel} non valido. Usa solo lettere, numeri, spazi, underscore (_) e trattini (-).`
            };
        }

        if (/^[_\-\s]|[_\-\s]$/.test(trimmed)) {
            return {
                valid: false,
                message: `${fieldLabel} non valido. Non può iniziare o finire con spazi, underscore o trattini.`
            };
        }

        return { valid: true, value: trimmed };
    };
}

// Validator specifico per username
const validateUsername = createStringValidator({
    fieldLabel: 'Username',
    min: 3,
    max: 20
});

// Validator specifico per nome stanza
const validateRoomName = createStringValidator({
    fieldLabel: 'Nome stanza',
    min: 3,
    max: 30 // cambia come preferisci
});

function validateRoomId(roomId) {
    if (typeof roomId !== 'string') {
        return { valid: false, message: 'ID stanza obbligatorio e deve essere una stringa.' };
    }

    const trimmed = roomId.trim();
    console.log(`Validating RoomId: "${trimmed}" (length: ${trimmed.length})`);

    if (trimmed.length !== 6) {
        return {
            valid: false,
            message: 'ID stanza non valido. Deve avere esattamente 6 caratteri.'
        };
    }

    const regex = /^[A-Z0-9]{6}$/;
    if (!regex.test(trimmed)) {
        return {
            valid: false,
            message: 'ID stanza non valido. Usa solo lettere maiuscole (A-Z) e numeri (0-9).'
        };
    }

    return { valid: true, value: trimmed };
}




module.exports = {
    validateUsername,
    validateRoomName,
    validateRoomId
};