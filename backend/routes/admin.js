const express = require('express');
const path = require('path');
const fs = require('fs');
const {
    getAllImages,
    getActiveImages,
    getImageById,
    updateImageFeedback,
    updateImageStatus,
    deleteImage,
    deleteAllImages,
} = require('../db/database');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

// GET /api/admin/images — List all images (with optional status filter)
router.get('/images', (req, res) => {
    try {
        const { status } = req.query;
        let images;
        if (status === 'active') {
            images = getActiveImages();
        } else {
            images = getAllImages();
        }
        res.json(images);
    } catch (err) {
        console.error('Fetch images error:', err);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

// GET /api/admin/export - Export all image metadata as CSV
function csvEscape(value) {
    const str = String(value ?? '');
    return `"${str.replace(/"/g, '""')}"`;
}

router.get('/export', (req, res) => {
    try {
        const images = getAllImages();
        const columns = ['id', 'name', 'feedback', 'status', 'image_path', 'bg_color', 'created_at', 'updated_at'];
        const rows = images.map(image => [
            image.id,
            image.name || '',
            image.feedback || image.text || '',
            image.status || '',
            image.image_path || '',
            image.bg_color || '',
            image.created_at || '',
            image.updated_at || '',
        ]);

        const csv = [
            columns.map(csvEscape).join(','),
            ...rows.map(row => row.map(csvEscape).join(',')),
        ].join('\n');

        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="social-wall-export-${stamp}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// PUT /api/admin/images/:id - Edit image feedback
router.put('/images/:id', (req, res) => {
    try {
        const { id } = req.params;
        const feedback = req.body.feedback ?? req.body.text;

        const image = getImageById(Number(id));
        if (!image) return res.status(404).json({ error: 'Image not found' });

        const trimmedFeedback = (feedback || '').trim().slice(0, 70);
        const updated = updateImageFeedback(Number(id), trimmedFeedback);

        const io = req.app.get('io');
        io.emit('update-image', updated);

        res.json({ success: true, image: updated });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Failed to update image' });
    }
});

// PATCH /api/admin/images/:id/archive — Soft delete
router.patch('/images/:id/archive', (req, res) => {
    try {
        const { id } = req.params;
        const image = getImageById(Number(id));
        if (!image) return res.status(404).json({ error: 'Image not found' });

        const updated = updateImageStatus(Number(id), 'archived');

        const io = req.app.get('io');
        io.emit('remove-image', { id: Number(id) });

        res.json({ success: true, image: updated });
    } catch (err) {
        console.error('Archive error:', err);
        res.status(500).json({ error: 'Failed to archive image' });
    }
});

// PATCH /api/admin/images/:id/restore — Restore archived
router.patch('/images/:id/restore', (req, res) => {
    try {
        const { id } = req.params;
        const image = getImageById(Number(id));
        if (!image) return res.status(404).json({ error: 'Image not found' });

        const updated = updateImageStatus(Number(id), 'active');

        const io = req.app.get('io');
        io.emit('new-image', updated);

        res.json({ success: true, image: updated });
    } catch (err) {
        console.error('Restore error:', err);
        res.status(500).json({ error: 'Failed to restore image' });
    }
});

// DELETE /api/admin/images/:id — Hard delete
router.delete('/images/:id', (req, res) => {
    try {
        const { id } = req.params;
        const image = getImageById(Number(id));
        if (!image) return res.status(404).json({ error: 'Image not found' });

        // Delete file from disk (wrapped in try-catch so it doesn't break DB deletion if locked)
        const filename = path.basename(image.image_path);
        const filePath = path.join(uploadsDir, filename);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (fileErr) {
            console.warn(`[ADMIN] Could not delete file from disk: ${filePath}`, fileErr.message);
        }

        deleteImage(Number(id));

        const io = req.app.get('io');
        io.emit('remove-image', { id: Number(id) });

        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// DELETE /api/admin/reset — Hard delete ALL images and files
router.delete('/reset', (req, res) => {
    try {
        const allImages = getAllImages();

        // 1. Delete all associated files from disk
        allImages.forEach(image => {
            const filename = path.basename(image.image_path);
            const filePath = path.join(uploadsDir, filename);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (fileErr) {
                console.warn(`[ADMIN] Could not delete file during full reset: ${filePath}`, fileErr.message);
            }
        });

        // 2. Wipe database
        deleteAllImages();

        // 3. Notify all clients to clear their screens instantly
        const io = req.app.get('io');
        io.emit('reset-wall');

        console.log('[ADMIN] 💥 COMPLETE WALL RESET EXECUTED');
        res.json({ success: true });
    } catch (err) {
        console.error('Full reset error:', err);
        res.status(500).json({ error: 'Failed to fully reset the wall' });
    }
});

module.exports = router;
