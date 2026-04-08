/**
 * navbar.js - Enhanced with dropdown menu for AgentHelper.Source
 * Preserves ALL existing functionality
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ navbar.js loaded');
    
    // Get existing navbar elements (support both structures)
    const navLinks = document.getElementById('navLinks');
    const navContent = document.getElementById('navContent');
    const navActions = document.querySelector('.nav-actions');
    const hamburger = document.getElementById('hamburger');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const darkModeToggle = document.getElementById('darkModeToggle');
    
    // Get user data
    const token = localStorage.getItem('token');
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('user'));
    } catch (e) {}
    
    console.log('User:', user);
    console.log('Token exists:', !!token);
    
    // Get unread message count
    let unreadCount = 0;
    if (token) {
        try {
            const response = await fetch('http://localhost:3000/api/messages/unread/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) unreadCount = data.unreadCount;
        } catch (e) {}
    }
    
    // Build navigation based on existing structure
    if (navLinks) {
        buildModernNavWithDropdown(navLinks, navActions, user, token, unreadCount);
    } else if (navContent) {
        buildLegacyNavWithDropdown(navContent, user, token, unreadCount);
    }
    
    // Setup event listeners (preserve existing)
    setupEventListeners(hamburger, mobileMenuBtn, darkModeToggle, navLinks, navContent);
});

function buildModernNavWithDropdown(navLinks, navActions, user, token, unreadCount) {
    let linksHTML = '';
    
    // ===== YOUR EXISTING LINKS (preserved) =====
    linksHTML += `
        <li><a href="index.html">Home</a></li>
        <li><a href="#">Help</a></li>
        <li><a href="cleanersSection.html">Cleaners</a></li>
        <li><a href="nanniesPage.html">Nannies</a></li>
        <li><a href="elderlyCare.html">Elderly Care</a></li>
        <li><a href="otherServices.html">More Services</a></li>
    `;
    
    // ===== AGENTHELPER.SOURCE DROPDOWN (NEW - clean & organized) =====
    linksHTML += `
        <li class="dropdown">
            <a href="#" class="dropdown-trigger">AgentHelper.Source ▼</a>
            <ul class="dropdown-menu">
                <li><a href="jobs.html">🔍 Find Jobs</a></li>
                <li><a href="browse.html">🌟 Browse Talent</a></li>
                <li><a href="post-job.html">📝 Post a Job</a></li>
                <li><a href="my-applications.html">📋 My Applications</a></li>
                <li><a href="my-jobs.html">💼 My Jobs</a></li>
                <li><a href="dashboard.html">📊 Dashboard</a></li>
            </ul>
        </li>
    `;
    
    if (token && user) {
        // ===== ROLE-SPECIFIC LINKS (preserved) =====
        if (user.user_role === 'helper') {
            linksHTML += `
                <li><a href="profile.html" style="color: var(--teal); font-weight: 500;">✨ My Profile</a></li>
                <li><a href="profile.html#interview" style="color: var(--accent); font-weight: 500;">🎤 Take Interview</a></li>
            `;
        } else if (user.user_role === 'hirer') {
            linksHTML += `
                <li><a href="Profile.html">Profile</a></li>
            `;
        } else if (user.user_role === 'admin') {
            linksHTML += `
                <li><a href="admin.html" style="color: #e8a060; font-weight: 600;">⚙️ Admin</a></li>
            `;
        }
        
        // ===== MESSAGES LINK (with unread badge) =====
        const badgeHtml = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
        linksHTML += `<li><a href="messages.html">💬 Messages ${badgeHtml}</a></li>`;
        
        // ===== USER MENU (preserved) =====
        if (navActions) {
            navActions.innerHTML = `
                <span class="user-greeting">👋 ${user.name?.split(' ')[0] || 'User'}</span>
                <span class="role-badge role-${user.user_role}">${user.user_role === 'helper' ? '🧑‍🔧 Helper' : user.user_role === 'hirer' ? '👔 Hirer' : '⚙️ Admin'}</span>
                <button class="btn-ghost" onclick="logout()">Logout</button>
                <button class="dark-toggle" id="darkToggle" title="Toggle dark mode">🌙</button>
            `;
        }
    } else {
        // ===== LOGGED OUT MENU (preserved) =====
        if (navActions) {
            navActions.innerHTML = `
                <a href="login.html" class="btn-ghost">Login</a>
                <a href="account.html" class="btn-outline">Sign Up</a>
                <button class="dark-toggle" id="darkToggle" title="Toggle dark mode">🌙</button>
            `;
        }
    }
    
    navLinks.innerHTML = linksHTML;
    
    // Add dropdown toggle functionality
    setupDropdowns();
}

function buildLegacyNavWithDropdown(navContent, user, token, unreadCount) {
    let navHTML = '';
    
    // ===== YOUR EXISTING LINKS (preserved) =====
    navHTML += `
        <a href="index.html">Home</a>
        <a href="#" onclick="window.help()">Help</a>
        <a href="#" onclick="window.reveal()">More</a>
        <a href="#" onclick="window.setLocation()">Set Location</a>
        <a href="cleanersSection.html">Cleaners</a>
        <a href="nanniesPage.html">Nannies</a>
        <a href="elderlyCare.html">Elderly Care</a>
        <a href="otherServices.html">More Services</a>
    `;
    
    // ===== AGENTHELPER.SOURCE DROPDOWN (NEW) =====
    navHTML += `
        <div class="dropdown-legacy">
            <a href="#" class="dropdown-trigger-legacy">AgentHelper.Source ▼</a>
            <div class="dropdown-menu-legacy">
                <a href="jobs.html">🔍 Find Jobs</a>
                <a href="browse.html">🌟 Browse Talent</a>
                <a href="post-job.html">📝 Post a Job</a>
                <a href="my-applications.html">📋 My Applications</a>
                <a href="my-jobs.html">💼 My Jobs</a>
                <a href="dashboard.html">📊 Dashboard</a>
            </div>
        </div>
    `;
    
    if (token && user) {
        // ===== ROLE-SPECIFIC LINKS (preserved) =====
        if (user.user_role === 'helper') {
            navHTML += `
                <a href="profile.html" class="nav-highlight">👤 My Profile</a>
                <a href="profile.html#interview" class="nav-interview">🎤 Take Interview</a>
            `;
        } else if (user.user_role === 'hirer') {
            navHTML += `
                <a href="EditProfile.html">Edit Profile</a>
            `;
        } else if (user.user_role === 'admin') {
            navHTML += `
                <a href="admin.html" class="nav-admin">⚙️ Admin</a>
            `;
        }
        
        // ===== MESSAGES LINK =====
        const badgeHtml = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';
        navHTML += `<a href="messages.html">💬 Messages ${badgeHtml}</a>`;
        
        // ===== USER MENU =====
        navHTML += `
            <div class="nav-right">
                <span class="user-greeting">Hi, ${user.name?.split(' ')[0] || 'User'}</span>
                <span class="role-badge role-${user.user_role}">
                    ${user.user_role === 'helper' ? '🧑‍🔧 Helper' : user.user_role === 'hirer' ? '👔 Hirer' : '⚙️ Admin'}
                </span>
                <button class="darkMode" id="darkModeToggle">🌙</button>
                <button class="logout-btn" onclick="window.logout()">Logout</button>
            </div>
        `;
    } else {
        navHTML += `
            <div class="nav-right">
                <a href="login.html" class="login-link">Login</a>
                <button class="darkMode" id="darkModeToggle">🌙</button>
                <button class="ai-btn" id="aiInterviewBtn">AI interview</button>
                <a href="profile.html" class="signup-btn">Create account</a>
            </div>
        `;
    }
    
    navContent.innerHTML = navHTML;
    
    // Add dropdown toggle functionality for legacy menu
    setupLegacyDropdowns();
}

function setupDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        if (trigger && menu) {
            // Hover to show
            dropdown.addEventListener('mouseenter', () => {
                menu.style.display = 'block';
            });
            
            dropdown.addEventListener('mouseleave', () => {
                menu.style.display = 'none';
            });
            
            // Click to toggle (for mobile)
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                const isVisible = menu.style.display === 'block';
                menu.style.display = isVisible ? 'none' : 'block';
            });
        }
    });
}

function setupLegacyDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown-legacy');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.dropdown-trigger-legacy');
        const menu = dropdown.querySelector('.dropdown-menu-legacy');
        
        if (trigger && menu) {
            dropdown.addEventListener('mouseenter', () => {
                menu.style.display = 'block';
            });
            
            dropdown.addEventListener('mouseleave', () => {
                menu.style.display = 'none';
            });
            
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                const isVisible = menu.style.display === 'block';
                menu.style.display = isVisible ? 'none' : 'block';
            });
        }
    });
}

function setupEventListeners(hamburger, mobileMenuBtn, darkModeToggle, navLinks, navContent) {
    // Dark mode toggle
    const darkToggle = document.getElementById('darkToggle') || darkModeToggle;
    if (darkToggle) {
        darkToggle.addEventListener('click', toggleDarkMode);
    }
    
    // Mobile menu
    const menuBtn = hamburger || mobileMenuBtn;
    const menuContainer = navLinks || navContent;
    
    if (menuBtn && menuContainer) {
        menuBtn.addEventListener('click', () => {
            menuContainer.classList.toggle('open');
            menuContainer.classList.toggle('show');
        });
        
        menuContainer.querySelectorAll('a, button').forEach(item => {
            item.addEventListener('click', () => {
                menuContainer.classList.remove('open');
                menuContainer.classList.remove('show');
            });
        });
    }
    
    // AI Interview button
    const aiBtn = document.getElementById('aiBtn') || document.getElementById('aiInterviewBtn');
    if (aiBtn) {
        aiBtn.addEventListener('click', () => {
            const token = localStorage.getItem('token');
            if (token) {
                const user = JSON.parse(localStorage.getItem('user'));
                if (user?.user_role === 'helper') {
                    window.location.href = 'profile.html#interview';
                } else {
                    alert('Only helpers can take the AI interview.');
                }
            } else {
                alert('Please log in to take the AI interview');
                window.location.href = 'login.html';
            }
        });
    }
}

window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
};

window.help = function() {
    alert('Help center coming soon!');
};

window.reveal = function() {
    alert('More options coming soon!');
};

window.setLocation = function() {
    const location = prompt("Enter your location:", "Mbombela");
    if (location) {
        localStorage.setItem('userLocation', location);
        alert(`Location set to ${location}`);
    }
};

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark') || document.body.classList.contains('dark-mode');
    const btn = document.getElementById('darkToggle') || document.getElementById('darkModeToggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark');
    document.body.classList.add('dark-mode');
}