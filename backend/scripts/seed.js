const fs = require('fs');
const path = require('path');
const https = require('https');
const { initDatabase, addImage, getRandomColor } = require('../db/database');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

const DUMMY_TEXTS = [
    "Having a blast!", "Great event 🎉", "Hello everyone",
    "Networking 💻", "Awesome vibes", "Tech rules!",
    "Loving the food 🍕", "Good times", "Smile!", "So much fun!"
];

async function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, response => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', err => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function seed() {
    console.log('[SEED] Initializing database...');
    await initDatabase();

    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    console.log('[SEED] Downloading and generating 10 dummy entries...');

    for (let i = 1; i <= 10; i++) {
        const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const filename = `wall_dummy_${uniqueId}.jpg`;
        const dest = path.join(uploadsDir, filename);

        // Download a random avatar/face placeholder
        const imgUrl = `https://i.pravatar.cc/400?img=${Math.floor(Math.random() * 70) + 1}`;
        console.log(`[SEED] Fetching image ${i}/10...`);

        try {
            await downloadImage(imgUrl, dest);

            const feedback = DUMMY_TEXTS[i - 1];
            const bgColor = getRandomColor();

            // Add to database
            const newImage = addImage(`/uploads/${filename}`, feedback, bgColor);
            console.log(`[SEED] Added: ${newImage.feedback} -> ${newImage.image_path}`);
        } catch (e) {
            console.error(`[SEED] Error on image ${i}:`, e.message);
        }
    }

    console.log('[SEED] ✅ Seeding complete! You can now view the social wall.');
    process.exit(0);
}

seed();
