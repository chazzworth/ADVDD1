const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const prisma = require('./prismaClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/characters', require('./routes/characters'));

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve static assets in production
const path = require('path');
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));

    app.get('(.*)', (req, res) => {
        // Don't intercept API routes
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: 'API route not found' });
        }
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit();
});
