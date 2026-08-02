document.addEventListener('DOMContentLoaded', () => {
    const toggleLogin = document.getElementById('toggle-login');
    const toggleRegister = document.getElementById('toggle-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // UI Tab Toggle
    toggleLogin.addEventListener('click', () => {
        toggleLogin.classList.add('active');
        toggleRegister.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    });

    toggleRegister.addEventListener('click', () => {
        toggleRegister.classList.add('active');
        toggleLogin.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    });

    // Sign In Action
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const identifier = document.getElementById('login-identifier').value;
        
        // Dynamic Role Routing Preview
        if (identifier.toLowerCase().includes('admin')) {
            window.location.href = 'admin/dashboard.html';
        } else {
            window.location.href = 'student/dashboard.html';
        }
    });

    // Sign Up Action
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert("Application submitted successfully! Redirecting to student dashboard...");
        window.location.href = 'student/dashboard.html';
    });
});
