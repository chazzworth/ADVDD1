const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const prisma = require('../prismaClient');
const authenticateToken = require('../middleware/auth');

// Configure multer for file upload
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload and process PDF Context
router.post('/upload/:campaignId', authenticateToken, upload.single('pdf'), async (req, res) => {
    const { campaignId } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    try {
        // 1. Check ownership
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId }
        });

        if (!campaign || campaign.userId !== req.user.userId) {
            // Clean up file
            fs.unlinkSync(req.file.path);
            return res.status(403).json({ error: 'Not authorized for this campaign' });
        }

        // 2. Read and parse PDF
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdf(dataBuffer);
        const extractedText = data.text;

        // 3. Update Campaign Context (Append or Replace? Let's Append for now, or just Replace?)
        // User said "upload .pdf context", usually implies "This is the source". Let's Replace/Append.
        // Let's replace for simplicity or allow appending with a newline.
        // For MVP: Simple Replace makes it easy to "reset" context. 
        // Better: Append if existing? 
        // Let's go with Append for now so they can upload multiple chapters.

        const newContext = (campaign.context ? campaign.context + "\n\n--- NEW SOURCE ---\n\n" : "") + extractedText.substring(0, 100000); // Limit context size?

        await prisma.campaign.update({
            where: { id: campaignId },
            data: { context: newContext }
        });

        // 4. Cleanup
        fs.unlinkSync(req.file.path);

        res.json({ message: 'Context uploaded successfully', preview: extractedText.substring(0, 200) + '...' });
    } catch (error) {
        console.error("Context Upload Error:", error);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

module.exports = router;
