/**
 * admin.js - Admin Dashboard
 * Complete working version with proper error handling
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========== AUTH CHECK ==========
    const token = localStorage.getItem('token');
    let user = null;
    
    try {
        user = JSON.parse(localStorage.getItem('user'));
    } catch (e) {
        console.error('Failed to parse user from localStorage');
    }
    
    console.log('Admin page loaded');
    console.log('Token exists:', !!token);
    console.log('User:', user);
    
    if (!token || !user) {
        console.log('No token or user, redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    // Verify admin role - check both user_role and token payload
    if (user.user_role !== 'admin') {
        // Also check token payload for admin role
        try {
            const tokenPayload = JSON.parse(atob(token.split('.')[1]));
            if (tokenPayload.user_role !== 'admin') {
                console.log('User is not admin. Role:', user.user_role);
                alert('Access denied. Admin privileges required.');
                window.location.href = 'index.html';
                return;
            }
        } catch (e) {
            console.error('Failed to parse token');
            alert('Access denied. Admin privileges required.');
            window.location.href = 'index.html';
            return;
        }
    }
    
    // ========== ELEMENT REFERENCES ==========
    const tabs = document.querySelectorAll('.admin-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Stats elements
    const totalUsers = document.getElementById('totalUsers');
    const totalHelpers = document.getElementById('totalHelpers');
    const totalHirers = document.getElementById('totalHirers');
    const totalInterviews = document.getElementById('totalInterviews');
    const avgScore = document.getElementById('avgScore');
    const newUsers = document.getElementById('newUsers');
    
    // Table bodies
    const usersTableBody = document.getElementById('usersTableBody');
    const interviewsTableBody = document.getElementById('interviewsTableBody');
    const profilesTableBody = document.getElementById('profilesTableBody');
    
    // Search
    const userSearch = document.getElementById('userSearch');
    const searchUsersBtn = document.getElementById('searchUsersBtn');
    
    // Modal
    const interviewModal = document.getElementById('interviewModal');
    
    // ========== STATE ==========
    let allUsers = [];
    let allInterviews = [];
    let allProfiles = [];
    
    // ========== INITIAL LOAD ==========
    loadDashboardData();
    
    // ========== EVENT LISTENERS ==========
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            tabPanes.forEach(pane => pane.classList.remove('active'));
            const targetPane = document.getElementById(`${tabName}-tab`);
            if (targetPane) targetPane.classList.add('active');
        });
    });
    
    // Search
    if (searchUsersBtn) {
        searchUsersBtn.addEventListener('click', filterUsers);
    }
    if (userSearch) {
        userSearch.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') filterUsers();
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === interviewModal) {
            interviewModal.style.display = 'none';
        }
    });
    
    // ========== API FUNCTIONS ==========
    
    async function loadDashboardData() {
        try {
            await Promise.all([
                loadStats(),
                loadUsers(),
                loadInterviews(),
                loadProfiles()
            ]);
            // Initialize charts if Chart.js is loaded
            if (typeof Chart !== 'undefined') {
                initCharts();
            }
        } catch (error) {
            console.error('Dashboard load error:', error);
        }
    }
    
    async function loadStats() {
        try {
            console.log('Loading stats...');
            const response = await fetch('http://localhost:3000/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Stats response:', data);
            
            if (data.success) {
                const stats = data.stats;
                if (totalUsers) totalUsers.textContent = stats.total_users || 0;
                if (totalHelpers) totalHelpers.textContent = stats.total_helpers || 0;
                if (totalHirers) totalHirers.textContent = stats.total_hirers || 0;
                if (totalInterviews) totalInterviews.textContent = stats.total_interviews || 0;
                if (avgScore) avgScore.textContent = stats.avg_interview_score ? 
                    `${parseFloat(stats.avg_interview_score).toFixed(1)}%` : '-';
                if (newUsers) newUsers.textContent = stats.new_users_week || 0;
            } else {
                console.error('Stats error:', data.error);
            }
        } catch (error) {
            console.error('Load stats error:', error);
            if (totalUsers) totalUsers.textContent = 'Error';
        }
    }
    
    async function loadUsers() {
        if (!usersTableBody) return;
        
        try {
            console.log('Loading users...');
            const response = await fetch('http://localhost:3000/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                if (response.status === 403) {
                    usersTableBody.innerHTML = `专栏<td colspan="9" class="error-row">Access denied. Make sure you are logged in as admin.`;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
                return;
            }
            
            const data = await response.json();
            console.log('Users response:', data);
            
            if (data.success) {
                allUsers = data.users;
                displayUsers(allUsers);
            } else {
                usersTableBody.innerHTML = `<tr><td colspan="9" class="error-row">${data.error || 'Failed to load users'}</td></tr>`;
            }
        } catch (error) {
            console.error('Load users error:', error);
            usersTableBody.innerHTML = `<tr><td colspan="9" class="error-row">Error: ${error.message}</td></tr>`;
        }
    }
    
    function displayUsers(users) {
        if (!usersTableBody) return;
        
        if (!users || users.length === 0) {
            usersTableBody.innerHTML = `<tr><td colspan="9" class="empty-row">No users found</td></tr>`;
            return;
        }
        
        usersTableBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${escapeHtml(user.name)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>
                    <select class="admin-role-select" data-user-id="${user.id}" onchange="updateUserRole(${user.id}, this.value)">
                        <option value="helper" ${user.user_role === 'helper' ? 'selected' : ''}>Helper</option>
                        <option value="hirer" ${user.user_role === 'hirer' ? 'selected' : ''}>Hirer</option>
                        <option value="admin" ${user.user_role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td>${user.user_type || 'freelancer'}</td>
                <td>${user.profile_count || 0}</td>
                <td>${user.interview_count || 0}</td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="admin-action-btn" onclick="viewUserDetails(${user.id})" title="View">👁️</button>
                    <button class="admin-action-btn danger" onclick="deleteUser(${user.id})" title="Delete">🗑️</button>
                </td>
            </tr>
        `).join('');
    }
    
    function filterUsers() {
        const searchTerm = userSearch ? userSearch.value.toLowerCase().trim() : '';
        
        if (!searchTerm) {
            displayUsers(allUsers);
            return;
        }
        
        const filtered = allUsers.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm)
        );
        
        displayUsers(filtered);
    }
    
    async function loadInterviews() {
        if (!interviewsTableBody) return;
        
        try {
            console.log('Loading interviews...');
            const response = await fetch('http://localhost:3000/api/admin/interviews', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Interviews response:', data);
            
            if (data.success) {
                allInterviews = data.interviews;
                displayInterviews(allInterviews);
            } else {
                interviewsTableBody.innerHTML = `<tr><td colspan="7" class="error-row">${data.error || 'Failed to load interviews'}</td></tr>`;
            }
        } catch (error) {
            console.error('Load interviews error:', error);
            interviewsTableBody.innerHTML = `<tr><td colspan="7" class="error-row">Error loading interviews</td></tr>`;
        }
    }
    
    function displayInterviews(interviews) {
        if (!interviewsTableBody) return;
        
        if (!interviews || interviews.length === 0) {
            interviewsTableBody.innerHTML = `<tr><td colspan="7" class="empty-row">No interviews found</td></tr>`;
            return;
        }
        
        interviewsTableBody.innerHTML = interviews.map(interview => `
            <tr>
                <td>${interview.id}</td>
                <td>${escapeHtml(interview.user_name)}</td>
                <td>${escapeHtml(interview.email)}</td>
                <td>${interview.role || 'N/A'}</td>
                <td><strong>${interview.total_score}%</strong></td>
                <td>${new Date(interview.completed_at).toLocaleString()}</td>
                <td>
                    <button class="admin-action-btn" onclick="viewInterviewDetails(${interview.id})">View Details</button>
                </td>
            </tr>
        `).join('');
    }
    
    async function loadProfiles() {
        if (!profilesTableBody) return;
        
        try {
            console.log('Loading profiles...');
            const response = await fetch('http://localhost:3000/api/profiles', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Profiles response:', data);
            
            if (data.success) {
                allProfiles = data.profiles;
                displayProfiles(allProfiles);
            } else {
                profilesTableBody.innerHTML = `<tr><td colspan="8" class="error-row">${data.error || 'Failed to load profiles'}</td></tr>`;
            }
        } catch (error) {
            console.error('Load profiles error:', error);
            profilesTableBody.innerHTML = `<tr><td colspan="8" class="error-row">Error loading profiles</td></tr>`;
        }
    }
    
    function displayProfiles(profiles) {
        if (!profilesTableBody) return;
        
        if (!profiles || profiles.length === 0) {
            profilesTableBody.innerHTML = `<tr><td colspan="8" class="empty-row">No profiles found</td></tr>`;
            return;
        }
        
        profilesTableBody.innerHTML = profiles.map(profile => {
            // Safely handle rating
            let rating = profile.rating;
            if (rating === null || rating === undefined || isNaN(parseFloat(rating))) {
                rating = 0;
            } else {
                rating = parseFloat(rating);
            }
            
            return `
            <tr>
                <td>${profile.id}</td>
                <td>${escapeHtml(profile.name)}</td>
                <td>${profile.service_type || 'Not set'}</td>
                <td>${rating > 0 ? rating.toFixed(1) + ' ★' : 'No rating'}</td>
                <td>${profile.location || 'Not set'}</td>
                <td>${profile.is_verified ? '✅' : '❌'}</td>
                <td>${new Date(profile.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="admin-action-btn" onclick="viewProfileDetails(${profile.id})">👁️ View</button>
                </td>
            </tr>
        `}).join('');
    }
    
    // ========== CHARTS ==========
    function initCharts() {
        // User Growth Chart
        const ctx = document.getElementById('userGrowthChart')?.getContext('2d');
        if (ctx) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: getLastMonths(6),
                    datasets: [{
                        label: 'New Users',
                        data: [12, 19, 15, 25, 32, 40],
                        borderColor: '#00938a',
                        backgroundColor: 'rgba(0, 147, 138, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } }
                }
            });
        }
        
        // Score Distribution Chart
        const scoreCtx = document.getElementById('scoreDistributionChart')?.getContext('2d');
        if (scoreCtx) {
            new Chart(scoreCtx, {
                type: 'bar',
                data: {
                    labels: ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'],
                    datasets: [{
                        label: 'Number of Interviews',
                        data: [2, 5, 12, 25, 18],
                        backgroundColor: '#00938a',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } }
                }
            });
        }
        
        // Service Type Chart
        const serviceCtx = document.getElementById('serviceTypeChart')?.getContext('2d');
        if (serviceCtx) {
            new Chart(serviceCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Nannies', 'Cleaners', 'Nurses'],
                    datasets: [{
                        data: [45, 30, 25],
                        backgroundColor: ['#00938a', '#00b3a8', '#006f68'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }
    
    function getLastMonths(count) {
        const months = [];
        const date = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date();
            d.setMonth(date.getMonth() - i);
            months.push(d.toLocaleString('default', { month: 'short' }));
        }
        return months;
    }
    
    // ========== UTILITIES ==========
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});

// ========== GLOBAL FUNCTIONS ==========

async function updateUserRole(userId, newRole) {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
        // Reload to reset the select
        location.reload();
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`http://localhost:3000/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ user_role: newRole })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('User role updated successfully', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Failed to update role', 'error');
        }
    } catch (error) {
        console.error('Update role error:', error);
        showNotification('Network error', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`http://localhost:3000/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('User deleted successfully', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.error || 'Failed to delete user', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showNotification('Network error', 'error');
    }
}

function viewUserDetails(userId) {
    alert(`User ${userId} details - Full profile view coming soon!`);
}

async function viewInterviewDetails(interviewId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:3000/api/admin/interviews/${interviewId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showInterviewModal(data.interview);
        } else {
            alert('Could not load interview details');
        }
    } catch (error) {
        console.error('View interview error:', error);
        alert('Error loading interview details');
    }
}

function showInterviewModal(interview) {
    const modal = document.getElementById('interviewModal');
    if (!modal) return;
    
    let resultsHtml = '';
    if (interview.results && interview.results.length > 0) {
        resultsHtml = interview.results.map((r, i) => `
            <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--bg); border-radius: 8px;">
                <strong>Q${i+1}:</strong> ${escapeHtml(r.question)}<br>
                <strong>A:</strong> ${escapeHtml(r.answer)}<br>
                <strong>Score:</strong> ${r.score}%<br>
                ${r.feedback ? `<strong>Feedback:</strong> ${escapeHtml(r.feedback)}` : ''}
            </div>
        `).join('');
    }
    
    modal.innerHTML = `
        <div class="svc-modal">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <h3 style="font-family: var(--font-display);">Interview Details</h3>
                <button onclick="document.getElementById('interviewModal').style.display='none'" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
            <div style="margin-bottom: 0.75rem;"><strong>User:</strong> ${escapeHtml(interview.user_name)}</div>
            <div style="margin-bottom: 0.75rem;"><strong>Email:</strong> ${escapeHtml(interview.email)}</div>
            <div style="margin-bottom: 0.75rem;"><strong>Role:</strong> ${interview.role || 'N/A'}</div>
            <div style="margin-bottom: 0.75rem;"><strong>Total Score:</strong> ${interview.total_score}%</div>
            <div style="margin-bottom: 0.75rem;"><strong>Completed:</strong> ${new Date(interview.completed_at).toLocaleString()}</div>
            ${resultsHtml}
            <div style="margin-top: 1rem;">
                <button class="btn-primary" onclick="document.getElementById('interviewModal').style.display='none'">Close</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function viewProfileDetails(profileId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:3000/api/profiles/${profileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showProfileModal(data.profile);
        } else {
            alert('Could not load profile details');
        }
    } catch (error) {
        console.error('View profile error:', error);
        alert('Error loading profile');
    }
}

function showProfileModal(profile) {
    const modal = document.getElementById('interviewModal');
    if (!modal) return;
    
    let rating = profile.rating || 0;
    rating = parseFloat(rating);
    const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    
    modal.innerHTML = `
        <div class="svc-modal">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                <h3 style="font-family: var(--font-display);">Profile: ${escapeHtml(profile.name)}</h3>
                <button onclick="document.getElementById('interviewModal').style.display='none'" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
            </div>
            <div><strong>Name:</strong> ${escapeHtml(profile.name)}</div>
            <div><strong>Role:</strong> ${profile.role || 'Professional'}</div>
            <div><strong>Rating:</strong> ${stars} (${rating.toFixed(1)})</div>
            <div><strong>Rate:</strong> ${profile.rate || 'R200/hour'}</div>
            <div><strong>Experience:</strong> ${profile.experience || '0 months'}</div>
            <div><strong>Location:</strong> ${profile.location || 'Not set'}</div>
            <div><strong>Service Type:</strong> ${profile.service_type || 'Not specified'}</div>
            <div><strong>Verified:</strong> ${profile.is_verified ? '✅ Yes' : '❌ No'}</div>
            <div><strong>Bio:</strong> ${profile.bio || 'No bio provided.'}</div>
            ${profile.photos?.length ? `<div><strong>Photos:</strong> ${profile.photos.length} photo(s)</div>` : ''}
            ${profile.documents?.length ? `<div><strong>Documents:</strong> ${profile.documents.length} document(s)</div>` : ''}
            ${profile.video ? `<div><strong>Video:</strong> ✅ Has introduction video</div>` : ''}
            <div><strong>Created:</strong> ${new Date(profile.created_at).toLocaleString()}</div>
            <div style="margin-top: 1rem;">
                <button class="btn-primary" onclick="document.getElementById('interviewModal').style.display='none'">Close</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    notification.style.backgroundColor = type === 'success' ? '#00938a' : '#e53e3e';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}