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
                finalContent = finalContent.replace(updateRegex, '').trim();

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

// Server-side Roll Endpoint (User)
router.post('/campaigns/:id/roll', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { diceType } = req.body; // e.g., "d20"

    if (!diceType) return res.status(400).json({ error: 'Dice type required' });

    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id },
            include: { character: true } // context for potential updates (not used yet but good practice)
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const sides = parseInt(diceType.substring(1));
        if (isNaN(sides)) return res.status(400).json({ error: 'Invalid dice type' });

        const result = Math.floor(Math.random() * sides) + 1;
        const content = `*Rolls ${diceType}... Result: ${result}*`;

        // Save Roll Message
        const message = await prisma.message.create({
            data: {
                role: 'user',
                content,
                campaignId: id,
            },
        });

        // Trigger AI response? 
        // Usually a roll is followed by AI reaction. 
        // For now, just return the roll. The frontend might trigger the AI response?
        // Actually, usually users want the DM to react to the roll immediately if it's part of the flow.
        // But let's keep it simple: Client rolls, gets result, then maybe Client sends "I attack" or the Client automatically triggers a "reaction" request?
        // Current flow in FE: handleRoll just sends a message. The AI *does* reply to messages normally.
        // But `handleRoll` in FE usually just pushed a user message.
        // To keep behavior consistent: The `/roll` endpoint should probably *just* record the roll. 
        // If the user wants the AI to react, they usually send text with it or we trigger it.
        // Wait, `handleRoll` in FE currently sends a message to `/message`. That endpoint *triggers* the AI.
        // If I make a separate `/roll` endpoint, does it trigger the AI?
        // If I want the DM to react to the result, I should probably trigger the AI here too?
        // Let's make `/roll` behave like a "User Message" that *also* triggers the AI?
        // Actually, usually rolls are "actions".
        // Let's START by just logging the roll. The user can then type "I hit AC 15".
        // OR better: The user rolls, and we immediately pass that context to the AI.
        // Let's stick to the current FE pattern: The FE calls `/message` to "send" the roll.
        // BUT we want server-side RNG.
        // So `/roll` should return the message, and then the FE might call `/message`? No that's double.
        // Let's make `/roll` ALMOST identical to `/message` but it generates the content itself.
        // AND it triggers the AI response. Yes. That makes the most sense for "I roll to attack".

        // Prepare context for Claude (React to the roll)
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

        // Get recent messages for context
        const recentMessages = await prisma.message.findMany({
            where: { campaignId: id },
            orderBy: { createdAt: 'asc' }, // Oldest first
            take: 10 // Limit context window
        });

        const conversation = recentMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
        conversation.push({ role: 'user', content }); // Add the roll message

        const key = process.env.ANTHROPIC_API_KEY; // Use server key
        // NOTE: If using client-provided key in body, need to pass it here. 
        // For /roll, let's assume Env key or req.body.apiKey if we want to support that.
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
                // Fallback? just don't return AI message
            }

            if (aiText) {
                // Parse Updates
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

module.exports = router;
