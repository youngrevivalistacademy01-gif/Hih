// Particle background — same system as other auth pages
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
        this.x += this.speedX; this.y += this.speedY;
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
for (let i = 0; i < 80; i++) particlesArray.push(new Particle());
function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
animateParticles();

// ---- Signup logic ----
const form = document.getElementById('signupForm');
const fullNameInput = document.getElementById('fullName');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');

const fullNameError = document.getElementById('fullNameError');
const emailError = document.getElementById('emailError');
const passwordError = document.getElementById('passwordError');
const confirmPasswordError = document.getElementById('confirmPasswordError');
const formError = document.getElementById('formError');
const formSuccess = document.getElementById('formSuccess');
const signupBtn = document.getElementById('signupBtn');

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
    signupBtn.disabled = isLoading;
    signupBtn.classList.toggle('loading', isLoading);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';
    formSuccess.textContent = '';

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    let hasError = false;

    if (!fullName) {
        setFieldError(fullNameInput, fullNameError, 'Full name is required.');
        hasError = true;
    } else {
        setFieldError(fullNameInput, fullNameError, '');
    }

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
    } else if (password.length < 6) {
        setFieldError(passwordInput, passwordError, 'Must be at least 6 characters.');
        hasError = true;
    } else {
        setFieldError(passwordInput, passwordError, '');
    }

    if (!confirmPassword) {
        setFieldError(confirmPasswordInput, confirmPasswordError, 'Please confirm your password.');
        hasError = true;
    } else if (confirmPassword !== password) {
        setFieldError(confirmPasswordInput, confirmPasswordError, 'Passwords do not match.');
        hasError = true;
    } else {
        setFieldError(confirmPasswordInput, confirmPasswordError, '');
    }

    if (hasError) return;

    setLoading(true);

    try {
        // 1. Create the auth account
        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
            email,
            password
        });

        if (signUpError) throw signUpError;

        if (!signUpData.user) {
            throw new Error('Account creation failed. Please try again.');
        }

        // 2. Create the matching student profile row.
        // matric_number is filled automatically by the database trigger.
        // student_enrollment is created automatically by the database trigger.
        const { error: profileError } = await supabaseClient
            .from('students')
            .insert({
                id: signUpData.user.id,
                full_name: fullName,
                email: email
            });

        if (profileError) {
            // Auth account exists but profile failed — surface a clear message
            // rather than leaving the user in a half-created state silently.
            throw new Error('Account created, but profile setup failed. Please contact support.');
        }

        // 3. If email confirmation is required, there's no active session yet.
        if (!signUpData.session) {
            formSuccess.textContent = 'Account created! Check your email to confirm before signing in.';
            form.reset();
            setLoading(false);
            return;
        }

        // 4. If confirmation isn't required, the user is already signed in.
        window.location.href = 'dashboard.html';

    } catch (err) {
        formError.textContent = err.message || 'Unable to create account. Please try again.';
        setLoading(false);
    }
});
