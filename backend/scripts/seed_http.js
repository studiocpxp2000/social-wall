const fs = require('fs');

async function seedHttp() {
    const DUMMY_TEXTS = [
        "Having a blast!", "Great event 🎉", "Hello everyone",
        "Networking 💻", "Awesome vibes", "Tech rules!",
        "Loving the food 🍕", "Good times", "Smile!", "So much fun!"
    ];

    console.log('[SEED] Starting HTTP seed process to live server...');
    console.log('[SEED] This will take about ~30-40 seconds to process all 10 images through the AI background remover.');

    for (let i = 1; i <= 10; i++) {
        console.log(`\n[SEED] Fetching photo ${i}/10...`);
        try {
            const imgRes = await fetch(`https://i.pravatar.cc/600?img=${i + 15}`);
            if (!imgRes.ok) throw new Error('Failed to fetch avatar');

            const arrayBuffer = await imgRes.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });

            const formData = new FormData();
            formData.append('image', blob, `dummy_${i}.jpg`);
            formData.append('feedback', DUMMY_TEXTS[i - 1]);

            console.log(`[SEED] Uploading '${DUMMY_TEXTS[i - 1]}' to running server (this invokes AI rembg)...`);

            const res = await fetch('http://localhost:3000/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (data.success) {
                console.log(`[SEED] ✅ Successfully uploaded ID: ${data.image.id}`);
            } else {
                console.error(`[SEED] ❌ Server returned error:`, data.error);
            }

            // Wait 500ms between requests to let the UI animations play out nicely if someone is watching
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.error(`[SEED] Error on image ${i}:`, e.message);
        }
    }

    console.log('\n[SEED] 🎉 Live seeding complete! Check the Social Wall and Admin Panel.');
}

seedHttp();
