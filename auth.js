// ==========================================
// 1. SUPABASE CLIENT INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://vhxdqcqbwnskhujzgtsy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoeGRxY3Fid25za2h1anpndHN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODA5NTEsImV4cCI6MjEwMTI1Njk1MX0.fZAwMZn1sXtJTXqjSf5gdOc8xoXPwm6wfa_dOKP3sJM';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function showMessage(msg, isError = false) {
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.innerText = msg;
        statusMsg.className = `status-msg ${isError ? 'error' : 'success'}`;
        statusMsg.style.display = 'block';
    }
}

function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;

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

    for (let i = 0; i < 100; i++) particlesArray.push(new Particle());

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesArray.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animateParticles);
    }
    animateParticles();
}

// ==========================================
// 2. TOGGLE & AUTHENTICATION LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initParticles();

    const toggleLogin = document.getElementById('toggle-login');
    const toggleRegister = document.getElementById('toggle-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const statusMsg = document.getElementById('status-message');

    // Switch to Sign In
    if (toggleLogin && toggleRegister && loginForm && registerForm) {
        toggleLogin.onclick = function() {
            toggleLogin.classList.add('active');
            toggleRegister.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
            if (statusMsg) statusMsg.style.display = 'none';
        };

        // Switch to Sign Up
        toggleRegister.onclick = function() {
            toggleRegister.classList.add('active');
            toggleLogin.classList.remove('active');
            registerForm.classList.add('active');
            loginForm.classList.remove('active');
            if (statusMsg) statusMsg.style.display = 'none';
        };
    }

    // Handle Sign Up
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('reg-fullname').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;

            showMessage('Submitting application...');

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email,
                password: password
            });

            if (authError) {
                showMessage(authError.message, true);
                return;
            }

            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([
                        { 
                            id: authData.user.id, 
                            full_name: fullName, 
                            email: email,
                            role: 'student',
                            current_class: 'foundational'
                        }
                    ]);

                if (profileError) {
                    showMessage(profileError.message, true);
                } else {
                    showMessage('Registration successful! Redirecting to student portal...');
                    setTimeout(() => {
                        window.location.href = 'student-dashboard.html';
                    }, 1500);
                }
            }
        });
    }

    // Handle Sign In
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            showMessage('Verifying credentials...');

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                showMessage(error.message, true);
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            showMessage('Login successful! Redirecting...');
            
            setTimeout(() => {
                if (profile && profile.role === 'admin') {
                    window.location.href = 'admin/dashboard.html';
                } else {
                    window.location.href = 'student-dashboard.html';
                }
            }, 1000);
        });
    }
});
