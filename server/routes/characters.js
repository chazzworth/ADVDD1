const express = require('express');
const authenticateToken = require('../middleware/auth');
const prisma = require('../prismaClient');

const router = express.Router();

// Get all characters for user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const characters = await prisma.character.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(characters);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch characters' });
    }
});

// Get single character
router.get('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const character = await prisma.character.findUnique({
            where: { id }
        });
        if (!character || character.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Character not found' });
        }
        res.json(character);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch character' });
    }
});

// Create new character
router.post('/', authenticateToken, async (req, res) => {
    const { name, race, class: charClass, alignment, stats, hp, maxHp, ac, background } = req.body;

    try {
        const character = await prisma.character.create({
            data: {
                name,
                race,
                class: charClass,
                alignment,
                hp,
                maxHp,
                ac,
                strength: stats.strength,
                dexterity: stats.dexterity,
                constitution: stats.constitution,
                intelligence: stats.intelligence,
                wisdom: stats.wisdom,
                charisma: stats.charisma,
                background: background || '',
                userId: req.user.userId
            }
        });
        res.json(character);
    } catch (error) {
        console.error("Create Character Error:", error);
        res.status(500).json({ error: 'Failed to create character', details: error.message });
    }
});

// Delete character
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const character = await prisma.character.findUnique({ where: { id } });
        if (!character || character.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Character not found' });
        }

        await prisma.character.delete({ where: { id } });
        res.json({ message: 'Character deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete character' });
    }
});

module.exports = router;
