const express = require('express');
const authenticateToken = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../prismaClient');
const axios = require('axios'); // Added for Google Imagen

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
    const { content, apiKey } = req.body;

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
            characterContext = `\nPLAYER CHARACTER:\nName: ${c.name}\nRace: ${c.race}\nClass: ${c.class}\nLevel: ${c.level}\nHP: ${c.hp}/${c.maxHp}\nAC: ${c.ac}\nStats: STR ${c.strength}, DEX ${c.dexterity}, CON ${c.constitution}, INT ${c.intelligence}, WIS ${c.wisdom}, CHA ${c.charisma}\nAlignment: ${c.alignment}\nInventory: ${c.inventory || "Standard starting gear"}\nCoin Pouch: ${c.pp}pp, ${c.gp}gp, ${c.ep}ep, ${c.sp}sp, ${c.cp}cp`;
        }

        const systemPrompt = `You are a BRUTAL, IMPARTIAL Dungeon Master running a solo campaign for a player using ${campaign.system} rules. 
    Setting: World of Greyhawk or as specified. 
    Rule 1: Be descriptive but DO NOT PANDER. You are a referee, not a fan.
    Rule 2: Dice results are LAW. Do not fudge rolls to save the character. Death is part of the game.
    Rule 3: Adhere strictly to the provided PDF Context (if any) for lore and rules.
    Rule 4: YOU MUST TRACK THE CHARACTER'S STATUS. If the character's HP, Gold, or Inventory changes, you MUST append a JSON block to the end of your response like this:
    <<<UPDATE { "hp": 15, "gp": 50, "inventory": "Sword, Shield, Rations" }>>>
    Only include fields that changed. "inventory" should be the FULL updated list string.
    Rule 5: IF YOU NEED TO ROLL DICE (e.g., for an NPC attack or random event), you must output a tag like this:
    <<<ROLL d20>>> or <<<ROLL d6>>>
    The system will roll for you and insert the result. Do not invent the number yourself.
    
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
            console.warn(`Model ${activeModel} failed. Attempting fallback.`);
            if (activeModel !== "claude-haiku-4-5-20251001") {
                const fallback = await anthropic.messages.create({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
                });
                aiText = fallback.content[0].text;
            } else {
                throw initialError;
            }
        }

        // --- STATE SYNCHRONIZATION LOGIC ---
        let updatedCharacter = null;
        let finalContent = aiText;

        // 1. Intercept DM Rolls
        const rollRegex = /<<<ROLL d(\d+)>>>/g;
        finalContent = finalContent.replace(rollRegex, (match, sides) => {
            const result = Math.floor(Math.random() * parseInt(sides)) + 1;
            return `(Rolled d${sides}: ${result})`;
        });

        // 2. Intercept State Updates
        const updateRegex = /<<<UPDATE\s*(\{.*?\})\s*>>>/s;
        const match = finalContent.match(updateRegex);

        if (match && campaign.character) {
            try {
                const updates = JSON.parse(match[1]);
                console.log("Applying AI Character Updates:", updates);

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
                finalContent = finalContent.replace(updateRegex, '').trim();

            } catch (parseErr) {
                console.error("Failed to parse AI update block:", parseErr);
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

        res.json({ message: aiMessage, character: updatedCharacter });

    } catch (error) {
        console.error("Anthropic API Error Details:", JSON.stringify(error, null, 2));
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

        await prisma.message.deleteMany({
            where: { campaignId: id }
        });

        await prisma.campaign.delete({
            where: { id }
        });

        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

// Server-side Roll Endpoint (User)
router.post('/campaigns/:id/roll', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { diceType } = req.body;

    if (!diceType) return res.status(400).json({ error: 'Dice type required' });

    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: { character: true }
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const sides = parseInt(diceType.substring(1));
        if (isNaN(sides)) return res.status(400).json({ error: 'Invalid dice type' });

        const result = Math.floor(Math.random() * sides) + 1;
        const content = `*Rolls ${diceType}... Result: ${result}*`;

        const message = await prisma.message.create({
            data: { role: 'user', content, campaignId: id, },
        });

        // Trigger AI Reaction
        let characterContext = "";
        if (campaign.character) {
            const c = campaign.character;
            characterContext = `\nPLAYER CHARACTER:\nName: ${c.name}\nRace: ${c.race}\nClass: ${c.class}\nLevel: ${c.level}\nHP: ${c.hp}/${c.maxHp}\nAC: ${c.ac}\nStats: STR ${c.strength}, DEX ${c.dexterity}, CON ${c.constitution}, INT ${c.intelligence}, WIS ${c.wisdom}, CHA ${c.charisma}\nAlignment: ${c.alignment}`;
        }

        const systemPrompt = `You are a BRUTAL, IMPARTIAL Dungeon Master running a solo campaign for a player using ${campaign.system} rules. 
    Setting: World of Greyhawk or as specified. 
    Rule 1: Be descriptive but DO NOT PANDER. You are a referee, not a fan.
    Rule 2: Dice results are LAW. The player just rolled a ${diceType} and got ${result}. React to this.
    Rule 3: Adhere strictly to the provided PDF Context (if any) for lore and rules.
    Rule 4: YOU MUST TRACK THE CHARACTER'S STATUS. If the character's HP, Gold, or Inventory changes, you MUST append a JSON block to the end of your response like this:
    <<<UPDATE { "hp": 15, "gp": 50, "inventory": "Sword, Shield, Rations" }>>>
    Only include fields that changed. "inventory" should be the FULL updated list string.

    Current Campaign: ${campaign.name}
    ${characterContext}
    
    ${campaign.context ? `\n\nCAMPAIGN KNOWLEDGE BASE (STRICT ADHERENCE REQUIRED):\n${campaign.context.substring(0, 20000)}` : ''}

    ${campaign.customInstructions ? `\nCUSTOM INSTRUCTIONS:\n${campaign.customInstructions.substring(0, 1000)}` : ''}`;

        const recentMessages = await prisma.message.findMany({
            where: { campaignId: id },
            orderBy: { createdAt: 'asc' },
            take: 10
        });

        const conversation = recentMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        conversation.push({ role: 'user', content });

        const key = process.env.ANTHROPIC_API_KEY;
        const apiKeyToUse = req.body.apiKey || key;

        let aiMessage = null;
        let updatedCharacter = null;

        if (apiKeyToUse) {
            const anthropic = new Anthropic({ apiKey: apiKeyToUse });
            const activeModel = campaign.aiModel || "claude-haiku-4-5-20251001";

            let aiText = "";
            try {
                const response = await anthropic.messages.create({
                    model: activeModel,
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: conversation
                });
                aiText = response.content[0].text;
            } catch (err) {
                console.warn("AI Generation failed on roll", err);
            }

            if (aiText) {
                let finalContent = aiText;
                const updateRegex = /<<<UPDATE\s*(\{.*?\})\s*>>>/s;
                const match = aiText.match(updateRegex);

                if (match && campaign.character) {
                    try {
                        const updates = JSON.parse(match[1]);
                        const allowedFields = ['hp', 'maxHp', 'ac', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma', 'pp', 'gp', 'ep', 'sp', 'cp', 'inventory', 'level', 'experience'];
                        const cleanUpdates = {};
                        Object.keys(updates).forEach(key => {
                            if (allowedFields.includes(key)) cleanUpdates[key] = updates[key];
                        });
                        if (Object.keys(cleanUpdates).length > 0) {
                            updatedCharacter = await prisma.character.update({
                                where: { id: campaign.character.id },
                                data: cleanUpdates
                            });
                        }
                        finalContent = aiText.replace(updateRegex, '').trim();
                    } catch (e) { }
                }

                aiMessage = await prisma.message.create({
                    data: { role: 'assistant', content: finalContent, campaignId: id }
                });
            }
        }

        res.json({
            userMessage: message,
            aiMessage: aiMessage,
            character: updatedCharacter
        });

    } catch (error) {
        console.error("Roll Error:", error);
        res.status(500).json({ error: 'Failed to process server roll' });
    }
});

// --- IMAGE GENERATION ENDPOINT (Google Nano Banana / Imagen) ---
router.post('/campaigns/:id/image', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { apiKey } = req.body;

    // Prioritize body key, then env key (Supports Server-Side Config)
    const googleKey = apiKey || process.env.GOOGLE_API_KEY;

    if (!googleKey) {
        return res.status(400).json({ error: 'Google API Key required (Set in Settings or .env as GOOGLE_API_KEY)' });
    }

    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: { messages: { orderBy: { createdAt: 'asc' }, take: -10 } }
        });

        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        // 1. Generate Image Prompt using Claude
        let imagePrompt = "A fantasy scene from a D&D campaign.";
        const anthropicKey = process.env.ANTHROPIC_API_KEY;

        if (anthropicKey) {
            const anthropic = new Anthropic({ apiKey: anthropicKey });
            const recentHistory = campaign.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
            const promptMsg = await anthropic.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 200,
                system: "You are an art director. Summarize the current scene into a vivid, detailed prompt for an image generator (Google Imagen). Focus on visual elements, lighting, and atmosphere. Output ONLY the prompt.",
                messages: [{ role: "user", content: `Context:\n${recentHistory}\n\nDescribe the current scene:` }]
            });
            imagePrompt = promptMsg.content[0].text;
        }

        // 2. Generate Image with Google (Imagen 3)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${googleKey}`;

        const body = {
            instances: [
                { prompt: imagePrompt }
            ],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1"
            }
        };

        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
        });

        const predictions = response.data.predictions;
        if (!predictions || predictions.length === 0) {
            throw new Error("No image generated by Google API");
        }

        const b64 = predictions[0].bytesBase64Encoded;
        const mime = predictions[0].mimeType || "image/png";
        const imageUrl = `data:${mime};base64,${b64}`;

        res.json({ imageUrl, prompt: imagePrompt });

    } catch (error) {
        const errorDetails = error.response ? error.response.data : error.message;
        console.error("Google Image Gen Error:", JSON.stringify(errorDetails, null, 2));
        res.status(500).json({ error: 'Failed to generate image with Google', details: errorDetails });
    }
});

module.exports = router;
