// register.js - Complete version for your registration page

document.addEventListener('DOMContentLoaded', () => {
    console.log('Registration page loaded');
    
    const registerBtn = document.getElementById('registerBtn');
    
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        console.log('User already logged in');
        // Optional: redirect to profile if you want
        // window.location.href = 'profile.html';
    }

    // Make sure the register button exists
    if (!registerBtn) {
        console.error('Register button not found! Check if ID="registerBtn" exists in HTML');
        return;
    }

    registerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('Register button clicked');

        // Get all form values with error checking
        const email = document.getElementById('emailField')?.value.trim();
        const password = document.getElementById('passwordField')?.value.trim();
        const firstName = document.getElementById('firstName')?.value.trim();
        const surname = document.getElementById('surname')?.value.trim();
        const idNumber = document.getElementById('idNumber')?.value.trim();
        const phoneNumber = document.getElementById('phoneNumber')?.value.trim();
        const dateOfBirth = document.getElementById('dateOfBirth')?.value;
        const gender = document.getElementById('genderField')?.value;
        
        // NEW: Get user role from select element
        const userRole = document.getElementById('userRole')?.value;
        
        // Debug: log what we got
        console.log('Form values:', { email, firstName, surname, userRole });

        // Validation - check required fields
        if (!email || !password || !firstName || !surname) {
            alert('Please fill in all required fields: Email, Password, First Name, and Surname');
            return;
        }

        // NEW: Validate user role
        if (!userRole) {
            alert('Please select whether you are a Helper or Hirer');
            return;
        }

        // Email validation (basic)
        if (!email.includes('@') || !email.includes('.')) {
            alert('Please enter a valid email address');
            return;
        }

        // Password validation
        if (password.length < 6) {
            alert('Password must be at least 6 characters long');
            return;
        }

        // Combine first name and surname for the backend's "name" field
        const fullName = `${firstName} ${surname}`.trim();

        // Prepare skills array (empty for now - you can add skills input later)
        const skills = [];

        // Create a bio from the additional information
        const bio = `ID: ${idNumber || 'Not provided'} | Phone: ${phoneNumber || 'Not provided'} | DOB: ${dateOfBirth || 'Not provided'} | Gender: ${gender || 'Not specified'}`;

        // User type - default to freelancer
        const userType = 'freelancer';

        // Prepare user data for backend - NOW INCLUDING user_role
        const userData = {
            name: fullName,
            email: email,
            password: password,
            user_type: userType,
            skills: skills,
            bio: bio,
            user_role: userRole // ADD THIS LINE - sends the role to backend
        };

        console.log('Sending to backend:', userData);

        // Disable button during request
        registerBtn.disabled = true;
        const originalText = registerBtn.textContent;
        registerBtn.textContent = 'Creating account...';

        try {
            // Make sure backend is running on this URL
            const response = await fetch('http://localhost:3000/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();
            console.log('Backend response:', data);

            if (response.ok && data.success) {
                // Store token and user data in localStorage
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                alert('✅ Registration successful!');
                
                // Redirect based on user role
                if (userRole === 'helper') {
                    window.location.href = 'profile.html'; // Helpers go to profile creation
                } else {
                    window.location.href = 'browse.html'; // Hirers go to browse professionals
                }
            } else {
                // Show error from backend
                alert('❌ Registration failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Network/Connection error:', error);
            alert('❌ Could not connect to server. Make sure backend is running on http://localhost:3000');
        } finally {
            // Re-enable button
            registerBtn.disabled = false;
            registerBtn.textContent = originalText;
        }
    });
});