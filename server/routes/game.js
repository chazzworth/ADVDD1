const express = require('express');
const authenticateToken = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../prismaClient');

const router = express.Router();

// Get all campaigns for user
router.get('/campaigns', authenticateToken, async (req, res) => {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

// Create new campaign
router.post('/campaigns', authenticateToken, async (req, res) => {
    const { name, system, aiModel, characterId, customInstructions } = req.body;
    try {
        const campaign = await prisma.campaign.create({
            data: {
                name: name || 'New Adventure',
                system: system || 'AD&D 1e',
                aiModel: aiModel || 'claude-haiku-4-5-20251001',
                userId: req.user.userId,
                characterId: characterId || null,
                customInstructions: customInstructions || null
            },
        });

        // Initial system message logic could go here or be dynamic
        res.json(campaign);
    } catch (error) {
        console.error("Campaign Creation Error:", error);
        res.status(500).json({ error: 'Failed to create campaign', details: error.message });
    }
});



// Get campaign details and messages
router.get('/campaigns/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' }
                },
                character: true
            },
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json(campaign);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch campaign' });
    }
});

// Send message (Interact with DM)
router.post('/campaigns/:id/message', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content, apiKey } = req.body; // Expect API key from client for now? Or env?

    if (!content) return res.status(400).json({ error: 'Content required' });

    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: {
                messages: { orderBy: { createdAt: 'asc' } },
                character: true
            }
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        // Save User Message
        await prisma.message.create({
            data: {
                role: 'user',
                content,
                campaignId: id,
            },
        });

        // Prepare context for Claude
        let characterContext = "";
        if (campaign.character) {
            const c = campaign.character;
            characterContext = `\nPLAYER CHARACTER:\nName: ${c.name}\nRace: ${c.race}\nClass: ${c.class}\nLevel: ${c.level}\nHP: ${c.hp}/${c.maxHp}\nAC: ${c.ac}\nStats: STR ${c.strength}, DEX ${c.dexterity}, CON ${c.constitution}, INT ${c.intelligence}, WIS ${c.wisdom}, CHA ${c.charisma}\nAlignment: ${c.alignment}`;
        }

        const systemPrompt = `You are a BRUTAL, IMPARTIAL Dungeon Master running a solo campaign for a player using ${campaign.system} rules. 
    Setting: World of Greyhawk or as specified. 
    Rule 1: Be descriptive but DO NOT PANDER. You are a referee, not a fan.
    Rule 2: Dice results are LAW. Do not fudge rolls to save the character. Death is part of the game.
    Rule 3: Adhere strictly to the provided PDF Context (if any) for lore and rules.
    Rule 4: YOU MUST TRACK THE CHARACTER'S STATUS. If the character's HP, Gold, or Inventory changes, you MUST append a JSON block to the end of your response like this:
    <<<UPDATE { "hp": 15, "gp": 50, "inventory": "Sword, Shield, Rations" }>>>
    Only include fields that changed. "inventory" should be the FULL updated list string.
    
    Current Campaign: ${campaign.name}
    ${characterContext}
    
    ${campaign.context ? `\n\nCAMPAIGN KNOWLEDGE BASE (STRICT ADHERENCE REQUIRED):\n${campaign.context.substring(0, 20000)}` : ''}

    ${campaign.customInstructions ? `\nCUSTOM INSTRUCTIONS:\n${campaign.customInstructions.substring(0, 1000)}` : ''}`;

        const messages = campaign.messages.map(m => ({
            role: m.role,
            content: m.content
        }));
        messages.push({ role: 'user', content });

        // Initialize Claude
        // NOTE: In production, apiKey should be strictly managed. Here we take from body or env.
        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            return res.status(500).json({ error: 'Anthropic API Key missing' });
        }

        const anthropic = new Anthropic({ apiKey: key });

        const activeModel = campaign.aiModel || "claude-haiku-4-5-20251001";
        let response;
        let aiText = "";

        try {
            response = await anthropic.messages.create({
                model: activeModel,
                max_tokens: 1024,
                system: systemPrompt,
                messages: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
            });
            aiText = response.content[0].text;
        } catch (initialError) {
            // Fallback
            console.warn(`Model ${activeModel} failed.Attempting fallback.`);
            if (activeModel !== "claude-haiku-4-5-20251001") {
                response = await anthropic.messages.create({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
                });
                aiText = response.content[0].text;
            } else {
                throw initialError;
            }
        }

        // --- STATE SYNCHRONIZATION LOGIC ---
        let updatedCharacter = null;
        let finalContent = aiText;

        const updateRegex = /<<<UPDATE\s*(\{.*?\})\s*>>>/s;
        const match = aiText.match(updateRegex);

        if (match && campaign.character) {
            try {
                const updates = JSON.parse(match[1]);
                console.log("Applying AI Character Updates:", updates);

                // Filter for allowed fields to prevent injection of garbage
                const allowedFields = ['hp', 'maxHp', 'ac', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'pp', 'gp', 'ep', 'sp', 'cp', 'inventory', 'level', 'experience'];
                const cleanUpdates = {};

                Object.keys(updates).forEach(key => {
                    if (allowedFields.includes(key)) {
                        cleanUpdates[key] = updates[key];
                    }
                });

                if (Object.keys(cleanUpdates).length > 0) {
                    updatedCharacter = await prisma.character.update({
                        where: { id: campaign.character.id },
                        data: cleanUpdates
                    });
                }

                // Remove the technical JSON from the chat log
                finalContent = aiText.replace(updateRegex, '').trim();

            } catch (parseErr) {
                console.error("Failed to parse AI update block:", parseErr);
                // We don't fail the request, just ignore the bad update
            }
        }

        // Save AI Response
        const aiMessage = await prisma.message.create({
            data: {
                role: 'assistant',
                content: finalContent,
                campaignId: id,
            },
        });

        // Return both message and updated character (if any)
        res.json({ message: aiMessage, character: updatedCharacter });

    } catch (error) {
        console.error("Anthropic API Error Details:", JSON.stringify(error, null, 2));
        if (error.response) {
            console.error("Response Data:", error.response.data);
            console.error("Response Headers:", error.response.headers);
        }
        res.status(500).json({ error: 'Failed to process message', details: error.message });
    }
});

// Delete a campaign
router.delete('/campaigns/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id }
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Campaign not found or unauthorized' });
        }

        // Manually cascade delete messages
        await prisma.message.deleteMany({
            where: { campaignId: id }
        });

        // Delete campaign
        await prisma.campaign.delete({
            where: { id }
        });

        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

module.exports = router;
