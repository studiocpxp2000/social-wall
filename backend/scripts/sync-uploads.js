const fs = require('fs');
const path = require('path');
const { initDatabase, addImage, getRandomColor, getAllImages } = require('../db/database');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

async function sync() {
    console.log('[SYNC] Initializing database...');
    await initDatabase();

    if (!fs.existsSync(uploadsDir)) {
        console.error(`[SYNC] Uploads directory not found at: ${uploadsDir}`);
        process.exit(1);
    }

    console.log('[SYNC] Scanning uploads directory...');
    const files = fs.readdirSync(uploadsDir);
    
    // Get all current images in DB
    const dbImages = getAllImages();
    const dbImagePaths = new Set(dbImages.map(img => img.image_path));
    
    let addedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        // Skip non-image files or hidden files
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
            continue;
        }

        const relativePath = `/uploads/${file}`;
        
        if (dbImagePaths.has(relativePath)) {
            skippedCount++;
            continue;
        }

        // Add missing file to database
        const bgColor = getRandomColor();
        const text = ""; // Default empty text
        
        console.log(`[SYNC] Found untracked file: ${file}. Adding to database...`);
        addImage(relativePath, text, bgColor);
        addedCount++;
    }

    console.log('[SYNC] =======================================');
    console.log('[SYNC] ✅ Sync complete!');
    console.log(`[SYNC] Added to DB: ${addedCount} new images`);
    console.log(`[SYNC] Already in DB: ${skippedCount} images`);
    console.log('[SYNC] =======================================');
    process.exit(0);
}

sync().catch(err => {
    console.error('[SYNC] Fatal error during synchronization:', err);
    process.exit(1);
});
