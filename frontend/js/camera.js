// ===========================
// CAMERA PAGE — camera.js
// ===========================

// Determine the backend base URL dynamically (e.g. if accessed via Live Server or VPS ports)
const getBackendUrl = () => {
    const { protocol, hostname, port } = window.location;
    if (port === '3008') {
        return `${protocol}//${hostname}:5005`;
    }
    if (port && port !== '3000') {
        return `${protocol}//${hostname}:3000`;
    }
    return '';
};
const BACKEND_URL = getBackendUrl();

const screens = {
    start: document.getElementById('start-screen'),
    inactive: document.getElementById('inactive-screen'),
    camera: document.getElementById('camera-screen'),
    preview: document.getElementById('preview-screen'),
    loading: document.getElementById('loading-screen'),
    success: document.getElementById('success-screen'),
};

const cameraFeed = document.getElementById('camera-feed');
const captureCanvas = document.getElementById('capture-canvas');
const captureBtn = document.getElementById('capture-btn');
const closeCameraBtn = document.getElementById('close-camera-btn');
const openCameraBtn = document.getElementById('open-camera-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const previewImage = document.getElementById('preview-image');
const captionInput = document.getElementById('caption-input');
const charCount = document.getElementById('char-count');
const textError = document.getElementById('text-error');
const retakeBtn = document.getElementById('retake-btn');
const uploadBtn = document.getElementById('upload-btn');
const newPhotoBtn = document.getElementById('new-photo-btn');
const loadingText = document.getElementById('loading-text');
const bgProgress = document.getElementById('bg-progress');
const spinner = document.getElementById('upload-spinner');

let currentStream = null;
let facingMode = 'user';
let capturedBlob = null;

// ===========================
// SCREEN NAVIGATION
// ===========================
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ===========================
// CAMERA SETUP
// ===========================
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }
}

async function startCamera() {
    stopCamera();

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
            audio: false,
        });
        cameraFeed.srcObject = currentStream;

        if (facingMode === 'user') {
            cameraFeed.classList.add('mirrored');
        } else {
            cameraFeed.classList.remove('mirrored');
        }
    } catch (err) {
        console.error('Camera access error:', err);
        alert('Unable to access camera. Please allow camera permission and try again.');
    }
}

switchCameraBtn.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera();
});

openCameraBtn.addEventListener('click', () => {
    showScreen('camera');
    startCamera();
});

closeCameraBtn.addEventListener('click', () => {
    stopCamera();
    showScreen('start');
});

// ===========================
// CAPTURE PHOTO
// ===========================
captureBtn.addEventListener('click', () => {
    const video = cameraFeed;
    const canvas = captureCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob((blob) => {
        capturedBlob = blob;
        previewImage.src = URL.createObjectURL(blob);
        showScreen('preview');
    }, 'image/jpeg', 0.9);
});

// ===========================
// TEXT INPUT — Required, max 20
// ===========================
captionInput.addEventListener('input', () => {
    const len = captionInput.value.trim().length;
    charCount.textContent = `${captionInput.value.length}/20`;

    if (len > 0 && len <= 20) {
        uploadBtn.disabled = false;
        uploadBtn.classList.remove('btn-disabled');
        textError.classList.remove('visible');
        captionInput.classList.remove('input-error');
    } else {
        uploadBtn.disabled = true;
        uploadBtn.classList.add('btn-disabled');
    }
});

// ===========================
// RETAKE
// ===========================
retakeBtn.addEventListener('click', () => {
    capturedBlob = null;
    captionInput.value = '';
    charCount.textContent = '0/20';
    uploadBtn.disabled = true;
    uploadBtn.classList.add('btn-disabled');
    textError.classList.remove('visible');
    captionInput.classList.remove('input-error');
    URL.revokeObjectURL(previewImage.src);
    showScreen('camera');
    startCamera(); // Make sure camera stream starts again when returning
});

// ===========================
// UPLOAD — Remove Background & Send
// ===========================
uploadBtn.addEventListener('click', async () => {
    if (!capturedBlob) return;

    const text = captionInput.value.trim();
    if (!text) {
        textError.classList.add('visible');
        captionInput.classList.add('input-error');
        captionInput.focus();
        return;
    }

    showScreen('loading');
    loadingText.textContent = 'Processing your photo...';
    bgProgress.parentElement.style.display = 'none';
    spinner.style.display = 'block';

    try {
        const startTime = performance.now();

        const formData = new FormData();
        formData.append('image', capturedBlob, 'photo.png');
        formData.append('text', text.slice(0, 20));

        const response = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`⏱️ Total upload + server processing: ${totalTime}s`);

        if (data.success) {
            showScreen('success');
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (err) {
        console.error('Upload error:', err);
        alert('Upload failed. Please try again.');
        showScreen('preview');
    }
});

// ===========================
// NEW PHOTO
// ===========================
newPhotoBtn.addEventListener('click', () => {
    capturedBlob = null;
    captionInput.value = '';
    charCount.textContent = '0/20';
    uploadBtn.disabled = true;
    uploadBtn.classList.add('btn-disabled');
    textError.classList.remove('visible');
    captionInput.classList.remove('input-error');
    showScreen('camera');
});

// ===========================
// INIT & SOCKET LISTENERS
// ===========================
const socket = io(BACKEND_URL);
let isCameraActiveGlobal = true;

// Initial connection
socket.on('connect', () => {
    console.log('Connected to server');
});

// Listen for admin toggle events
socket.on('camera-status', (isActive) => {
    isCameraActiveGlobal = isActive;

    if (isActive) {
        // Only switch back to start screen if we were on the inactive screen
        if (screens.inactive.classList.contains('active')) {
            showScreen('start');
        }
    } else {
        // If it was deactivated by admin:
        stopCamera();
        showScreen('inactive');
    }
});
