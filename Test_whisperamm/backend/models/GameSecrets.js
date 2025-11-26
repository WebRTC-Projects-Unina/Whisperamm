const { getRedisClient } = require('./redis');

class GameSecrets {
    //Composto da civilianWord e imposterWord

    static async create(civilianWord, imposterWord) {
        const client = getRedisClient();
        const secretsId = crypto.randomUUID();
        
        await client.hSet(`gamesecrets:${secretsId}`, {
            secretsId,
            civilianWord,
            imposterWord
        });
        return secretsId;
    }


    static async getById(secretsId) {
        const client = getRedisClient();
        const data = await client.hGetAll(`gamesecrets:${secretsId}`);
        if (Object.keys(data).length === 0) {
            return null; // Non trovato
        }
        return {
            civilianWord: data.civilianWord,
            imposterWord: data.imposterWord
        };
    }
}