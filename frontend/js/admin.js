// ===========================
// ADMIN PANEL — admin.js
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

// ===========================
// AUTH GUARD — redirect to login if no token
// ===========================
const TOKEN_KEY = 'admin_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
    return {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
    };
}

function authHeadersNoJSON() {
    return {
        Authorization: `Bearer ${getToken()}`,
    };
}

// Check auth on page load
(async function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/verify`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!data.valid) {
            localStorage.removeItem(TOKEN_KEY);
            window.location.href = '/login.html';
            return;
        }
    } catch (err) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/login.html';
        return;
    }

    // Auth OK — init the page
    initAdmin();
})();

function initAdmin() {
    const socket = io(BACKEND_URL);
    console.log('[ADMIN] Socket.IO connecting...');

    socket.on('connect', () => {
        console.log('[ADMIN] ✅ Socket connected! ID:', socket.id);
    });

    socket.on('connect_error', (err) => {
        console.error('[ADMIN] ❌ Socket connection error:', err.message);
    });

    // Auto-refresh data when socket reconnects (handles intermittent drops)
    socket.io.on('reconnect', () => {
        console.log('[ADMIN] Socket reconnected, refreshing data...');
        loadImages();
    });

    const adminGrid = document.getElementById('admin-grid');
    const adminEmpty = document.getElementById('admin-empty');
    const statActive = document.getElementById('stat-active');
    const statArchived = document.getElementById('stat-archived');
    const logoutBtn = document.getElementById('logout-btn');
    const cameraToggleBtn = document.getElementById('camera-toggle-btn');

    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Delete Modal
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');

    // Edit Modal
    const editModalOverlay = document.getElementById('edit-modal-overlay');
    const editTextInput = document.getElementById('edit-text-input');
    const editCancel = document.getElementById('edit-cancel');
    const editSave = document.getElementById('edit-save');

    // Reset Modal
    const resetModalOverlay = document.getElementById('reset-modal-overlay');
    const resetModalCancel = document.getElementById('reset-modal-cancel');
    const resetModalConfirm = document.getElementById('reset-modal-confirm');
    const resetWallBtn = document.getElementById('reset-wall-btn');

    let allImages = [];
    let currentFilter = 'all';
    let pendingDeleteId = null;
    let pendingEditId = null;

    // ===========================
    // LOGOUT
    // ===========================
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/login.html';
    });

    // ===========================
    // FETCH IMAGES (with auth)
    // ===========================
    async function loadImages() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/images`, {
                headers: authHeadersNoJSON(),
            });

            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }

            allImages = await res.json();
            renderGrid();
            updateStats();
        } catch (err) {
            console.error('Failed to load images:', err);
        }
    }

    // ===========================
    // UPDATE STATS
    // ===========================
    function updateStats() {
        const active = allImages.filter(i => i.status === 'active').length;
        const archived = allImages.filter(i => i.status === 'archived').length;
        statActive.textContent = `${active} Active`;
        statArchived.textContent = `${archived} Archived`;
    }

    // ===========================
    // RENDER GRID
    // ===========================
    function renderGrid() {
        let filtered = allImages;
        if (currentFilter === 'active') {
            filtered = allImages.filter(i => i.status === 'active');
        } else if (currentFilter === 'archived') {
            filtered = allImages.filter(i => i.status === 'archived');
        }

        if (filtered.length === 0) {
            adminGrid.innerHTML = '';
            adminEmpty.classList.add('visible');
            return;
        }

        adminEmpty.classList.remove('visible');

        adminGrid.innerHTML = filtered.map(img => {
            const isArchived = img.status === 'archived';
            const badgeClass = isArchived ? 'badge-archived' : 'badge-active';
            const badgeText = isArchived ? 'Archived' : 'Active';

            return `
        <div class="admin-card ${isArchived ? 'archived' : ''}" data-id="${img.id}">
          <div class="card-image-wrap">
            <img src="${img.image_path}" alt="${img.text || 'Photo'}" loading="lazy">
            <span class="card-status-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="card-body">
            <div class="card-text-display ${img.text ? '' : 'empty'}">
              <span class="card-color-dot" style="background:${img.bg_color}"></span>
              ${img.text ? escapeHtml(img.text) : 'No text'}
            </div>
            <div class="card-meta">ID: ${img.id} · ${formatDate(img.created_at)}</div>
            <div class="card-actions">
              <button class="btn btn-secondary" onclick="window._admin.openEditModal(${img.id})">✏️ Edit</button>
              ${isArchived
                    ? `<button class="btn btn-success" onclick="window._admin.restoreImage(${img.id})">↩ Restore</button>`
                    : `<button class="btn btn-warning" onclick="window._admin.archiveImage(${img.id})">📦 Archive</button>`
                }
              <button class="btn btn-danger" onclick="window._admin.openDeleteModal(${img.id})">🗑️</button>
            </div>
          </div>
        </div>
      `;
        }).join('');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ===========================
    // FILTER
    // ===========================
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderGrid();
        });
    });

    // ===========================
    // ARCHIVE IMAGE (with auth)
    // ===========================
    async function archiveImage(id) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/images/${id}/archive`, {
                method: 'PATCH',
                headers: authHeadersNoJSON(),
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (data.success) {
                const idx = allImages.findIndex(i => i.id === id);
                if (idx !== -1) allImages[idx] = data.image;
                renderGrid();
                updateStats();
            } else {
                alert('Archive failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Archive failed:', err);
        }
    }

    // ===========================
    // RESTORE IMAGE (with auth)
    // ===========================
    async function restoreImage(id) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/images/${id}/restore`, {
                method: 'PATCH',
                headers: authHeadersNoJSON(),
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (data.success) {
                const idx = allImages.findIndex(i => i.id === id);
                if (idx !== -1) allImages[idx] = data.image;
                renderGrid();
                updateStats();
            } else {
                alert('Restore failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Restore failed:', err);
        }
    }

    // ===========================
    // DELETE MODAL
    // ===========================
    function openDeleteModal(id) {
        pendingDeleteId = id;
        console.log('[ADMIN] Opening delete modal for id:', id);
        modalOverlay.classList.add('visible');
    }

    modalCancel.addEventListener('click', () => {
        pendingDeleteId = null;
        modalOverlay.classList.remove('visible');
    });

    modalConfirm.addEventListener('click', async () => {
        if (pendingDeleteId == null) {
            console.log('[ADMIN] No pendingDeleteId, ignoring');
            return;
        }

        const idToDelete = pendingDeleteId;
        pendingDeleteId = null;
        modalOverlay.classList.remove('visible');

        console.log('[ADMIN] Deleting image id:', idToDelete);

        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/images/${idToDelete}`, {
                method: 'DELETE',
                headers: authHeadersNoJSON(),
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (data.success) {
                allImages = allImages.filter(i => i.id !== idToDelete);
                renderGrid();
                updateStats();
            } else {
                alert('Delete failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('[ADMIN] Delete failed:', err);
            alert('Delete failed. Please try again.');
        }
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            pendingDeleteId = null;
            modalOverlay.classList.remove('visible');
        }
    });

    // ===========================
    // RESET WALL MODAL
    // ===========================
    resetWallBtn.addEventListener('click', () => {
        resetModalOverlay.classList.add('visible');
    });

    resetModalCancel.addEventListener('click', () => {
        resetModalOverlay.classList.remove('visible');
    });

    resetModalConfirm.addEventListener('click', async () => {
        resetModalOverlay.classList.remove('visible');
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/reset`, {
                method: 'DELETE',
                headers: authHeadersNoJSON(),
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (data.success) {
                // Instantly clear UI (it will also trigger via socket)
                allImages = [];
                renderGrid();
                updateStats();
                alert('Wall has been completely reset.');
            } else {
                alert('Reset failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Reset failed:', err);
            alert('Reset failed. Please try again.');
        }
    });

    resetModalOverlay.addEventListener('click', (e) => {
        if (e.target === resetModalOverlay) {
            resetModalOverlay.classList.remove('visible');
        }
    });

    // ===========================
    // EDIT MODAL
    // ===========================
    function openEditModal(id) {
        pendingEditId = id;
        const img = allImages.find(i => i.id === id);
        editTextInput.value = img ? img.text : '';
        editModalOverlay.classList.add('visible');
        editTextInput.focus();
    }

    editCancel.addEventListener('click', () => {
        pendingEditId = null;
        editModalOverlay.classList.remove('visible');
    });

    editSave.addEventListener('click', async () => {
        if (!pendingEditId) return;
        const text = editTextInput.value.trim().slice(0, 70);
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/images/${pendingEditId}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ text }),
            });
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem(TOKEN_KEY);
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            if (data.success) {
                const idx = allImages.findIndex(i => i.id === pendingEditId);
                if (idx !== -1) allImages[idx] = data.image;
                renderGrid();
            }
        } catch (err) {
            console.error('Edit failed:', err);
        }
        pendingEditId = null;
        editModalOverlay.classList.remove('visible');
    });

    editModalOverlay.addEventListener('click', (e) => {
        if (e.target === editModalOverlay) {
            pendingEditId = null;
            editModalOverlay.classList.remove('visible');
        }
    });

    // ===========================
    // REAL-TIME SOCKET UPDATES
    // ===========================
    socket.on('new-image', (image) => {
        console.log('[ADMIN] 📨 Received "new-image" event:', JSON.stringify(image));
        if (!allImages.find(i => i.id === image.id)) {
            allImages.unshift(image);
        }
        renderGrid();
        updateStats();
    });

    socket.on('update-image', (image) => {
        const idx = allImages.findIndex(i => i.id === image.id);
        if (idx !== -1) allImages[idx] = image;
        renderGrid();
        updateStats();
    });

    socket.on('remove-image', (data) => {
        const idx = allImages.findIndex(i => i.id === data.id);
        if (idx !== -1) {
            allImages[idx].status = 'archived';
        }
        renderGrid();
        updateStats();
    });

    let isCameraActiveAdmin = true;
    socket.on('camera-status', (isActive) => {
        isCameraActiveAdmin = isActive;
        if (isActive) {
            cameraToggleBtn.innerHTML = '📷 Camera: <strong>Active</strong>';
            cameraToggleBtn.classList.remove('btn-danger');
            cameraToggleBtn.classList.add('btn-primary');
        } else {
            cameraToggleBtn.innerHTML = '🛑 Camera: <strong>Inactive</strong>';
            cameraToggleBtn.classList.remove('btn-primary');
            cameraToggleBtn.classList.add('btn-danger');
        }
    });

    cameraToggleBtn.addEventListener('click', () => {
        socket.emit('toggle-camera', !isCameraActiveAdmin);
    });

    // Expose functions for inline onclick handlers
    window._admin = {
        archiveImage,
        restoreImage,
        openDeleteModal,
        openEditModal,
    };

    // ===========================
    // INIT
    // ===========================
    loadImages();
}
