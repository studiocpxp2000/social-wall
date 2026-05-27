// ===========================
// ADMIN LOGIN — login.js
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

// If already logged in, redirect to admin
const existingToken = localStorage.getItem('admin_token');
if (existingToken) {
    // Verify token is still valid
    fetch(`${BACKEND_URL}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${existingToken}` },
    })
        .then(res => res.json())
        .then(data => {
            if (data.valid) {
                window.location.href = '/admin.html';
            } else {
                localStorage.removeItem('admin_token');
            }
        })
        .catch(() => localStorage.removeItem('admin_token'));
}

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMsg = document.getElementById('error-msg');
const loginBtn = document.getElementById('login-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const togglePass = document.getElementById('toggle-pass');

// Toggle password visibility
togglePass.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
});

// Handle login
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        errorMsg.textContent = 'Please fill in all fields.';
        return;
    }

    // Show loading
    loginBtn.disabled = true;
    btnText.textContent = 'Signing in...';
    btnLoader.classList.remove('hidden');

    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (data.success && data.token) {
            localStorage.setItem('admin_token', data.token);
            window.location.href = '/admin.html';
        } else {
            errorMsg.textContent = data.error || 'Login failed.';
        }
    } catch (err) {
        errorMsg.textContent = 'Connection error. Try again.';
    } finally {
        loginBtn.disabled = false;
        btnText.textContent = 'Sign In';
        btnLoader.classList.add('hidden');
    }
});
