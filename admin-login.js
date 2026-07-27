// Particle background — same system as student login, dimmer density for a more restrained feel
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 1.6 + 0.1;
        this.speedX = Math.random() * 0.3 - 0.15;
        this.speedY = Math.random() * 0.3 - 0.15;
        this.opacity = Math.random() * 0.35;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
    }
    draw() {
        ctx.fillStyle = `rgba(139, 149, 161, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    for (let i = 0; i < 60; i++) particlesArray.push(new Particle());
}

function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

initParticles();
animateParticles();

// ---- Admin auth logic ----
// Requires supabase-client.js loaded before this file, exposing `supabaseClient`.

const form = document.getElementById('adminLoginForm');
const emailInput = document.getElementById('adminEmail');
const passwordInput = document.getElementById('adminPassword');
const emailError = document.getElementById('adminEmailError');
const passwordError = document.getElementById('adminPasswordError');
const formError = document.getElementById('adminFormError');
const signinBtn = document.getElementById('adminSigninBtn');

function setFieldError(input, errorEl, message) {
    if (message) {
        input.classList.add('invalid');
        errorEl.textContent = message;
        errorEl.classList.add('show');
    } else {
        input.classList.remove('invalid');
        errorEl.textContent = '';
        errorEl.classList.remove('show');
    }
}

function validateEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setLoading(isLoading) {
    signinBtn.disabled = isLoading;
    signinBtn.classList.toggle('loading', isLoading);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let hasError = false;

    if (!email) {
        setFieldError(emailInput, emailError, 'Admin email is required.');
        hasError = true;
    } else if (!validateEmail(email)) {
        setFieldError(emailInput, emailError, 'Enter a valid email address.');
        hasError = true;
    } else {
        setFieldError(emailInput, emailError, '');
    }

    if (!password) {
        setFieldError(passwordInput, passwordError, 'Admin password is required.');
        hasError = true;
    } else {
        setFieldError(passwordInput, passwordError, '');
    }

    if (hasError) return;

    setLoading(true);

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        // Confirm this account exists in the admins table before granting console access.
        const { data: adminRow, error: adminLookupError } = await supabaseClient
            .from('admins')
            .select('id')
            .eq('id', data.user.id)
            .single();

        if (adminLookupError || !adminRow) {
            await supabaseClient.auth.signOut();
            throw new Error('This account does not have administrator access.');
        }

        window.location.href = '/admin/dashboard.html';

    } catch (err) {
        formError.textContent = err.message || 'Unable to access console. Verify your credentials.';
        setLoading(false);
    }
});
