const axios = require('axios');
require('dotenv').config();

const API_URL = 'http://localhost:3000/api';

async function test() {
    try {
        // 1. Register
        const email = `test${Date.now()}@example.com`;
        const password = 'password123';
        console.log('Registering user:', email);
        await axios.post(`${API_URL}/auth/register`, { email, password });

        // 2. Login
        console.log('Logging in...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password });
        const token = loginRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        // 3. Create Campaign
        console.log('Creating campaign...');
        const campRes = await axios.post(`${API_URL}/game/campaigns`, {
            name: 'API Test Campaign',
            system: 'AD&D 1e'
        }, { headers });

        const campaignId = campRes.data.id;
        console.log('Campaign Created:', campaignId);

        // 4. Send Message (AI)
        console.log('Sending message to AI...');
        const msgRes = await axios.post(`${API_URL}/game/campaigns/${campaignId}/message`, {
            content: 'Hello DM, I look around the tavern.'
        }, { headers });

        console.log('AI Response:', msgRes.data);

    } catch (error) {
        console.error('Test Failed:', error.response ? error.response.data : error.message);
    }
}

test();
