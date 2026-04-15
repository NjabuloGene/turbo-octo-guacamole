/**
 * navbar.js - Simplified navigation
 */

document.addEventListener('DOMContentLoaded', async () => {
    const navLinks = document.getElementById('navLinks');
    const navActions = document.querySelector('.nav-actions');
    const hamburger = document.getElementById('hamburger');
    
    const token = localStorage.getItem('token');
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('user'));
    } catch (e) {}
    
    // Build navigation
    let linksHTML = '';
    
    if (token && user) {
        // Logged in user
        linksHTML += `<li><a href="index.html">🏠 Home</a></li>`;
        
        // Find Work dropdown
        linksHTML += `
            <li class="dropdown">
                <a href="#">💼 Find Work ▼</a>
                <ul class="dropdown-menu">
                    <li><a href="jobs.html">🔍 Browse Jobs</a></li>
                    <li><a href="my-applications.html">📋 My Applications</a></li>
                </ul>
            </li>
        `;
        
        // Hire Talent dropdown
        linksHTML += `
            <li class="dropdown">
                <a href="#">✨ Hire Talent ▼</a>
                <ul class="dropdown-menu">
                    <li><a href="browse.html">🌟 Find Talent</a></li>
                    <li><a href="post-job.html">📝 Post a Job</a></li>
                    <li><a href="my-jobs.html">💼 My Jobs</a></li>
                </ul>
            </li>
        `;
        
       // Helper specific
if (user.user_role === 'helper') {
    // Get pending requests count
    let pendingCount = 0;
    try {
        const hireRes = await fetch('http://localhost:3000/api/hire-requests', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const hireData = await hireRes.json();
        if (hireData.success && hireData.hireRequests) {
            pendingCount = hireData.hireRequests.filter(r => r.status === 'pending').length;
        }
    } catch(e) {}
    
    linksHTML += `<li><a href="profile.html">👤 My Profile</a></li>`;
    linksHTML += `<li><a href="hire-requests.html">📋 Hire Requests ${pendingCount > 0 ? `<span class="notification-badge">${pendingCount}</span>` : ''}</a></li>`;
}
        
        // Admin specific
        if (user.user_role === 'admin') {
            linksHTML += `<li><a href="admin.html">⚙️ Admin</a></li>`;
        }
        
        // Common for all logged in
        linksHTML += `<li><a href="messages.html">💬 Messages</a></li>`;
        linksHTML += `<li><a href="dashboard.html">📊 Dashboard</a></li>`;
        
        // Right side actions
        if (navActions) {
            navActions.innerHTML = `
                <span class="user-greeting">👋 ${user.name?.split(' ')[0] || 'User'}</span>
                <button class="btn-logout" onclick="logout()">Logout</button>
                <button class="dark-toggle" id="darkToggle">🌙</button>
            `;
        }
    } else {
        // Logged out
        linksHTML += `<li><a href="index.html">🏠 Home</a></li>`;
        linksHTML += `<li><a href="jobs.html">💼 Find Work</a></li>`;
        linksHTML += `<li><a href="browse.html">✨ Hire Talent</a></li>`;
        
        if (navActions) {
            navActions.innerHTML = `
                <a href="login.html" class="btn-ghost">Login</a>
                <a href="account.html" class="btn-outline">Sign Up</a>
                <button class="dark-toggle" id="darkToggle">🌙</button>
            `;
        }
    }
    
    navLinks.innerHTML = linksHTML;
    
    // Setup dropdowns
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        const trigger = dropdown.querySelector('a');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        if (trigger && menu) {
            trigger.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                }
            });
            
            dropdown.addEventListener('mouseenter', () => {
                if (window.innerWidth > 768) menu.style.display = 'block';
            });
            
            dropdown.addEventListener('mouseleave', () => {
                if (window.innerWidth > 768) menu.style.display = 'none';
            });
        }
    });
    
    // Mobile menu
    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('open');
            hamburger.classList.toggle('active');
        });
    }
    
    // Dark mode
    const darkToggle = document.getElementById('darkToggle');
    if (darkToggle) {
        darkToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            darkToggle.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }
    
    // Set initial dark mode
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark');
        const dt = document.getElementById('darkToggle');
        if (dt) dt.textContent = '☀️';
    }
});

window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
};