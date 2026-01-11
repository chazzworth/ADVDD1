const axios = require('axios');
require('dotenv').config();

async function listModels() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('Querying Anthropic API for available models...');

    try {
        const response = await axios.get(
            'https://api.anthropic.com/v1/models',
            {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                }
            }
        );

        console.log('\n--- AVAILABLE MODELS ---');
        response.data.data.forEach(model => {
            console.log(`- ${model.id} (${model.display_name})`);
        });
        console.log('------------------------\n');

    } catch (error) {
        console.error('List Models Error:', error.response ? error.response.data : error.message);
    }
}

listModels();
