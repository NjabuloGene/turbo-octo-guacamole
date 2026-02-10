// Grab form and input elements
const loginForm = document.getElementById('signupForm');
const emailField = document.getElementById('emailField');
const passwordField = document.getElementById('passwordField');

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

    if (password.length > 12) {
        alert("Password must not exceed 12 characters.");
        return;
    }

    // Prepare POST request to backend
    try {
        const response = await fetch('http://127.0.0.1:8000/login/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ email, password })
});

        const result = await response.json();

        // Handle response
        if (response.ok) {
            alert(result.message || "Login successful!");
            // Redirect to index page after login
            window.location.href = "index.html";
        } else {
            alert(result.error || "Login failed. Check your credentials.");
        }
    } catch (error) {
        console.error("Error connecting to backend:", error);
        alert("Could not connect to server. Try again later.");
    }
};