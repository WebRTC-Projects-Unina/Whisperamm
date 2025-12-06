    // Helper: Converte stringa arbitraria in ID numerico positivo per Janus
export const stringToIntegerId = (str) => {
        if (!str) return 0;
        
        // Se è già un numero o una stringa puramente numerica
        if (!isNaN(str) && !isNaN(parseFloat(str))) {
            return parseInt(str, 10);
        }

        // Se è una stringa esadecimale (comune negli ID generati)
        const hexParsed = parseInt(str, 16);
        // Verifica se è un hex valido e se la riconversione combacia (per evitare falsi positivi come "100px")
        const isHex = /^[0-9A-Fa-f]+$/.test(str);
        if (isHex && !isNaN(hexParsed)) {
            return hexParsed;
        }

        // Fallback: Hash della stringa (DJB2 o simile semplice)
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Converte in 32bit integer
        }
        return Math.abs(hash); // Janus gradisce ID positivi
    };