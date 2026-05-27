require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { initDatabase, getActiveImages } = require('./db/database');
const { authenticateToken } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
});

const rembgMode = (process.env.REMBG_MODE || 'local').toLowerCase();

// ===========================
// PYTHON REMBG SERVER MANAGER
// ===========================
let pythonServer;

function startPythonServer() {
    console.log('[SYSTEM] Starting Python Background Removal Service (venv)...');

    // Use the virtual environment Python executable
    const pythonExecutable = os.platform() === 'win32'
        ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
        : path.join(__dirname, 'venv', 'bin', 'python');

    pythonServer = spawn(pythonExecutable, ['scripts/rembg_server.py'], {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PORT: '5001' // Ensure Python doesn't inherit Express server's PORT (3000)
        }
    });

    pythonServer.stdout.on('data', (data) => {
        console.log(`[PYTHON] ${data.toString().trim()}`);
    });

    pythonServer.stderr.on('data', (data) => {
        console.error(`[PYTHON ERROR] ${data.toString().trim()}`);
    });

    pythonServer.on('close', (code) => {
        console.log(`[SYSTEM] Python service exited with code ${code}`);
    });
}

// Ensure Python server is killed when Node exits
process.on('SIGINT', () => {
    if (pythonServer) pythonServer.kill();
    process.exit();
});
process.on('SIGTERM', () => {
    if (pythonServer) pythonServer.kill();
    process.exit();
});
process.on('exit', () => {
    if (pythonServer) pythonServer.kill();
});

// Start local Python service only when not managed externally (e.g., Docker rembg container)
if (rembgMode !== 'external') {
    startPythonServer();
} else {
    console.log('[SYSTEM] REMBG_MODE=external, skipping local Python service startup.');
}

// ===========================
// EXPRESS MIDDLEWARE
// ===========================

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve uploads directory with 1 day caching
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: '1d'
}));

// Public API routes (no auth)
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);

// Health endpoint used by Docker and deploy scripts
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Public endpoint for social wall to fetch active images
app.get('/api/images', (req, res) => {
    try {
        // Cache API response for 15 seconds to dramatically reduce DB queries during high event traffic
        res.set('Cache-Control', 'public, max-age=15');
        const images = getActiveImages();
        res.json(images);
    } catch (err) {
        console.error('Fetch public images error:', err);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

// Protected admin API routes (JWT required)
app.use('/api/admin', authenticateToken, adminRoutes);

// Camera state
let isCameraActive = true;

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send current status on connect
    socket.emit('camera-status', isCameraActive);

    // Admin toggle event
    socket.on('toggle-camera', (status) => {
        isCameraActive = !!status;
        console.log(`[ADMIN] Camera active status set to: ${isCameraActive}`);
        // Broadcast to all connected clients (wall and camera screens)
        io.emit('camera-status', isCameraActive);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Initialize database then start server
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    server.listen(PORT, () => {
        const domain = process.env.APP_DOMAIN || `localhost:${PORT}`;
        const proto = process.env.APP_DOMAIN ? 'https' : 'http';
        const base = `${proto}://${domain}`;
        console.log(`Social Wall server running on ${base}`);
        console.log(`  Camera page:  ${base}/`);
        console.log(`  Social wall:  ${base}/wall.html`);
        console.log(`  Admin login:  ${base}/login.html`);
        console.log(`  Admin panel:  ${base}/admin.html`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
