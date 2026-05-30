const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { getRandomColor, addImage } = require('../db/database');

const router = express.Router();

// Uploads directory at project root (NOT in backend)
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// We no longer need temp directory for Python script


// Multer config — store in memory for Sharp processing
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    },
});

// Remove background using Python FastAPI microservice
async function removeBackground(imageBuffer) {
    const rembgUrl = process.env.REMBG_URL || 'http://127.0.0.1:5001';

    // We send raw bytes to the persistent Python service
    const response = await fetch(`${rembgUrl}/remove-bg`, {
        method: 'POST',
        body: imageBuffer,
        headers: {
            'Content-Type': 'application/octet-stream'
        }
    });

    if (!response.ok) {
        throw new Error(`Python service returned ${response.status} ${response.statusText}`);
    }

    // Return the transparent PNG buffer
    const arrayCb = await response.arrayBuffer();
    return Buffer.from(arrayCb);
}

// POST /api/upload
router.post('/', upload.single('image'), async (req, res) => {
    const startTime = Date.now();

    try {
        console.log('[UPLOAD] === New upload request received ===');

        if (!req.file) {
            console.log('[UPLOAD] ERROR: No file in request');
            return res.status(400).json({ error: 'No image provided' });
        }

        console.log('[UPLOAD] File received:', req.file.originalname, req.file.size, 'bytes');

        const text = (req.body.text || '').trim().slice(0, 70);
        const bgColor = getRandomColor();

        // Convert hex color to RGB for Sharp
        const r = parseInt(bgColor.slice(1, 3), 16);
        const g = parseInt(bgColor.slice(3, 5), 16);
        const b = parseInt(bgColor.slice(5, 7), 16);

        const SIZE = 400;
        const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const filename = `wall_${uniqueId}.webp`;
        const outputPath = path.join(uploadsDir, filename);

        // Pre-resize image to a max of 800px before sending it to Python.
        // This MASSIVELY speeds up AI background removal by reducing RAM and compute load!
        const preResizedBuffer = await sharp(req.file.buffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();

        // Step 1: Remove background using persistent Python FastAPI service
        let processedBuffer = preResizedBuffer;
        try {
            const rembgStart = Date.now();
            processedBuffer = await removeBackground(preResizedBuffer);
            console.log(`[UPLOAD] Step 1: Background removed in ${((Date.now() - rembgStart) / 1000).toFixed(2)}s`);
        } catch (bgErr) {
            console.warn('[UPLOAD] Step 1: Background removal failed, using original:', bgErr.message);
        }

        // Step 2: Overlay person on solid colored background and compress to webp
        await sharp(processedBuffer)
            .resize(SIZE, SIZE, { fit: 'cover', position: 'north' })
            .flatten({ background: { r, g, b } })
            .webp({ quality: 80, effort: 2 }) // effort 2 speeds up encoding by ~50%
            .toFile(outputPath);

        console.log('[UPLOAD] Step 2: Final image saved');

        // Save to database
        const newImage = addImage(`/uploads/${filename}`, text, bgColor);
        console.log('[UPLOAD] Database result:', JSON.stringify(newImage));

        // Broadcast to all connected wall clients
        const io = req.app.get('io');
        if (newImage && newImage.id != null) {
            io.emit('new-image', newImage);
            console.log('[UPLOAD] ✅ Emitted "new-image" event');
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[UPLOAD] === Complete in ${totalTime}s ===`);

        res.json({ success: true, image: newImage });
    } catch (err) {
        console.error('[UPLOAD] ❌ FATAL ERROR:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

module.exports = router;
