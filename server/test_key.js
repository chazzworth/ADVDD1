const axios = require('axios');
require('dotenv').config();

async function testAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('Testing Key:', apiKey.substring(0, 15) + '...');

    try {
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                messages: [{ role: "user", content: "Hello, world" }]
            },
            {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                }
            }
        );
        console.log('Success! Response:', response.data.content[0].text);
    } catch (error) {
        console.error('Direct API Error:', error.response ? error.response.data : error.message);
    }
}

testAnthropic();
