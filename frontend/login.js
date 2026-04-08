// login.js
document.addEventListener('DOMContentLoaded', () => {
    // Grab form and input elements - using IDs from your HTML
    const loginForm = document.getElementById('loginForm');
    const emailField = document.getElementById('emailField');
    const passwordField = document.getElementById('passwordField');
    
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        console.log('User already logged in');
        // Optional: redirect to profile if already logged in
        // window.location.href = 'profile.html';
    }
    
    // Check if form exists
    if (!loginForm) {
        console.error('Login form not found! Check that id="loginForm" exists');
        return;
    }
    
    loginForm.onsubmit = async (e) => {
        e.preventDefault(); // prevent default form submit

        const email = emailField.value.trim();
        const password = passwordField.value.trim();

        // Basic validation
        if (!email || !password) {
            alert("Please fill in both email and password fields.");
            return;
        }

        if (password.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }

        // Disable button to prevent double submission
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        // Prepare POST request to Node.js backend
        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();
            console.log('Login response:', result);

            // Handle response
            if (response.ok && result.success) {
                // Store the JWT token and user data
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.user));
                
                alert(result.message || "Login successful!");
                
                // Redirect based on user role
                if (result.user.user_role === 'helper') {
                    window.location.href = "profile.html";
                } else if (result.user.user_role === 'hirer') {
                    window.location.href = "browse.html";
                } else {
                    window.location.href = "admin.html";
                }
            } else {
                alert(result.error || "Login failed. Check your credentials.");
            }
        } catch (error) {
            console.error("Error connecting to backend:", error);
            alert("Could not connect to server. Make sure the backend is running on http://localhost:3000");
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    };
});