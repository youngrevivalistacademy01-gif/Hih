// Particle background — matches landing page
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.1;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.5;
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
        ctx.fillStyle = `rgba(255, 107, 61, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticles() {
    for (let i = 0; i < 80; i++) particlesArray.push(new Particle());
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

// ---- Auth logic ----
// Requires supabase-client.js loaded before this file, exposing `supabaseClient`.

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const formError = document.getElementById('formError');
const signinBtn = document.getElementById('signinBtn');

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
        setFieldError(emailInput, emailError, 'Email is required.');
        hasError = true;
    } else if (!validateEmail(email)) {
        setFieldError(emailInput, emailError, 'Enter a valid email address.');
        hasError = true;
    } else {
        setFieldError(emailInput, emailError, '');
    }

    if (!password) {
        setFieldError(passwordInput, passwordError, 'Password is required.');
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

        // Confirm this account is a student, not an admin, before routing.
        const { data: studentRow, error: studentLookupError } = await supabaseClient
            .from('students')
            .select('id')
            .eq('id', data.user.id)
            .single();

        if (studentLookupError || !studentRow) {
            await supabaseClient.auth.signOut();
            throw new Error('This account is not registered as a student.');
        }

        window.location.href = 'dashboard.html';

    } catch (err) {
        formError.textContent = err.message || 'Unable to sign in. Check your details and try again.';
        setLoading(false);
    }
});
