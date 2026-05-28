const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { initDatabase, addImage, getRandomColor, getAllImages } = require('../db/database');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const localDbPath = path.join(__dirname, '..', 'db', 'social_wall_local.db');

async function sync() {
    console.log('[SYNC] Initializing production database...');
    const prodDb = await initDatabase();

    if (!fs.existsSync(uploadsDir)) {
        console.error(`[SYNC] Uploads directory not found at: ${uploadsDir}`);
        process.exit(1);
    }

    // 1. Try to load local database if the user copied it over
    const localMetadata = new Map(); // Map: image_path -> { text, bg_color }
    if (fs.existsSync(localDbPath)) {
        console.log(`[SYNC] Found local database copy at: ${localDbPath}. Reading metadata...`);
        try {
            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(localDbPath);
            const localDb = new SQL.Database(fileBuffer);
            
            const stmt = localDb.prepare('SELECT image_path, text, bg_color FROM images');
            while (stmt.step()) {
                const row = stmt.getAsObject();
                if (row.image_path) {
                    localMetadata.set(row.image_path, {
                        text: row.text || '',
                        bg_color: row.bg_color
                    });
                }
            }
            stmt.free();
            console.log(`[SYNC] Successfully loaded metadata for ${localMetadata.size} images from local database!`);
        } catch (err) {
            console.warn(`[SYNC] Warning: Could not read local database file: ${err.message}`);
        }
    } else {
        console.log('[SYNC] No local database file found at backend/db/social_wall_local.db.');
        console.log('[SYNC] Note: To sync original text & colors, copy your local backend/db/social_wall.db to production as backend/db/social_wall_local.db before running this script.');
    }

    // 2. Scan physical uploads directory
    console.log('[SYNC] Scanning uploads directory...');
    const files = fs.readdirSync(uploadsDir);
    
    // Get all current images in DB
    const dbImages = getAllImages();
    const dbImagePaths = new Set(dbImages.map(img => img.image_path));
    
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
            continue;
        }

        const relativePath = `/uploads/${file}`;
        const localData = localMetadata.get(relativePath);
        
        if (dbImagePaths.has(relativePath)) {
            // File already exists in production DB. 
            // If we have local metadata, let's update the text/color in case they are currently blank/default.
            if (localData) {
                // Find the existing row in prod DB to see if it needs update
                const existing = dbImages.find(img => img.image_path === relativePath);
                if (existing && (existing.text !== localData.text || existing.bg_color !== localData.bg_color)) {
                    prodDb.run(
                        'UPDATE images SET text = ?, bg_color = ?, updated_at = CURRENT_TIMESTAMP WHERE image_path = ?',
                        [localData.text, localData.bg_color, relativePath]
                    );
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }
            continue;
        }

        // Add missing file to database
        const bgColor = localData ? localData.bg_color : getRandomColor();
        const text = localData ? localData.text : '';
        
        console.log(`[SYNC] Found untracked file: ${file}. Adding to database...`);
        addImage(relativePath, text, bgColor);
        addedCount++;
    }

    // Save production database to file
    const data = prodDb.export();
    const buffer = Buffer.from(data);
    const prodDbPath = path.join(__dirname, '..', 'db', 'social_wall.db');
    fs.writeFileSync(prodDbPath, buffer);

    console.log('[SYNC] =======================================');
    console.log('[SYNC] ✅ Sync complete!');
    console.log(`[SYNC] Added to DB:   ${addedCount} new images`);
    console.log(`[SYNC] Updated in DB: ${updatedCount} image texts/colors updated`);
    console.log(`[SYNC] Untouched:     ${skippedCount} images`);
    console.log('[SYNC] =======================================');
    process.exit(0);
}

sync().catch(err => {
    console.error('[SYNC] Fatal error during synchronization:', err);
    process.exit(1);
});
