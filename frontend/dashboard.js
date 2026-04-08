/**
 * dashboard.js - Complete user dashboard
 */

const API_BASE_URL = 'http://localhost:3000';
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    displayUserInfo();
    await loadDashboardData();
    setupTabs();
});

function displayUserInfo() {
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.user_role === 'helper' ? '🧑‍🔧 Helper' : '👔 Hirer';
}

async function loadDashboardData() {
    try {
        const token = localStorage.getItem('token');
        
        // Get message count
        const msgRes = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgRes.json();
        if (msgData.success) {
            const unreadCount = msgData.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            document.getElementById('messageCount').textContent = msgData.conversations.length;
        }
        
        // Get applications
        if (currentUser.user_role === 'helper') {
            const appRes = await fetch(`${API_BASE_URL}/api/business/my-applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const appData = await appRes.json();
            if (appData.success) {
                document.getElementById('applicationCount').textContent = appData.applications.length;
                displayApplications(appData.applications);
            }
        } else {
            const jobRes = await fetch(`${API_BASE_URL}/api/business/my-job-applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const jobData = await jobRes.json();
            if (jobData.success) {
                document.getElementById('applicationCount').textContent = jobData.applications.length;
                displayJobApplications(jobData.applications);
            }
            
            // Get posted jobs
            const jobsRes = await fetch(`${API_BASE_URL}/api/business/jobs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const jobsData = await jobsRes.json();
            if (jobsData.success) {
                displayJobs(jobsData.jobs.filter(j => j.business_id === currentUser.business_id));
            }
        }
        
        // Load profile data
        const profileRes = await fetch(`${API_BASE_URL}/api/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const profileData = await profileRes.json();
        if (profileData.success) {
            document.getElementById('editName').value = profileData.user.name || '';
            document.getElementById('editEmail').value = profileData.user.email || '';
            document.getElementById('editLocation').value = profileData.user.location || '';
            document.getElementById('editBio').value = profileData.user.bio || '';
        }
        
    } catch (error) {
        console.error('Load dashboard error:', error);
    }
}

function displayApplications(applications) {
    const container = document.getElementById('applicationsList');
    if (!container) return;
    
    if (!applications || applications.length === 0) {
        container.innerHTML = '<div class="empty-state">No applications yet</div>';
        return;
    }
    
    container.innerHTML = applications.map(app => `
        <div class="application-card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h3>${escapeHtml(app.title)}</h3>
                    <p>${escapeHtml(app.company_name)}</p>
                    <p>💰 ${app.salary_min ? `R${app.salary_min} - R${app.salary_max}` : 'Salary not specified'}</p>
                    <p>📍 ${app.location || 'Remote'}</p>
                </div>
                <div>
                    <span class="status-badge status-${app.status}">${app.status}</span>
                    <p class="conversation-time">Applied: ${new Date(app.created_at).toLocaleDateString()}</p>
                </div>
            </div>
        </div>
    `).join('');
}

function displayJobApplications(applications) {
    const container = document.getElementById('applicationsList');
    if (!container) return;
    
    if (!applications || applications.length === 0) {
        container.innerHTML = '<div class="empty-state">No applications received yet</div>';
        return;
    }
    
    container.innerHTML = applications.map(app => `
        <div class="application-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div>
                    <h3>${escapeHtml(app.candidate_name)}</h3>
                    <p>${app.role || 'Professional'}</p>
                    <p>⭐ ${app.rating || 'No rating'} • 📅 ${app.experience || '0 months'}</p>
                    <p>💰 Expected: ${app.expected_salary ? `R${app.expected_salary}` : 'Not specified'}</p>
                    <p>📝 ${app.cover_letter || 'No cover letter'}</p>
                </div>
                <div>
                    <select class="status-select" data-app-id="${app.id}" onchange="updateApplicationStatus(${app.id}, this.value)">
                        <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="reviewed" ${app.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                        <option value="shortlisted" ${app.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                        <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reject</option>
                        <option value="hired" ${app.status === 'hired' ? 'selected' : ''}>Hire</option>
                    </select>
                    <p class="conversation-time">Applied: ${new Date(app.created_at).toLocaleDateString()}</p>
                </div>
            </div>
        </div>
    `).join('');
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">No jobs posted yet</div>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <div>
                    <h3>${escapeHtml(job.title)}</h3>
                    <p>${job.employment_type || 'Full-time'} • ${job.location || 'Remote'}</p>
                    <p>💰 R${job.salary_min} - R${job.salary_max}</p>
                    <p>📝 ${job.description.substring(0, 100)}...</p>
                </div>
                <div>
                    <span class="status-badge status-${job.status}">${job.status}</span>
                    <p class="conversation-time">Posted: ${new Date(job.created_at).toLocaleDateString()}</p>
                    <p>👁️ ${job.view_count || 0} views • 📋 ${job.application_count || 0} applications</p>
                </div>
            </div>
        </div>
    `).join('');
}

function setupTabs() {
    const navItems = document.querySelectorAll('.dashboard-nav-item');
    const tabs = document.querySelectorAll('.dashboard-tab');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.dataset.tab;
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            tabs.forEach(tab => tab.classList.remove('active'));
            document.getElementById(`${tabName}-tab`).classList.add('active');
            if (tabName === 'calendar') loadCalendar();
        });
    });
}

async function updateProfile() {
    const name = document.getElementById('editName').value;
    const location = document.getElementById('editLocation').value;
    const bio = document.getElementById('editBio').value;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, location, bio })
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification('Profile updated!', 'success');
            const user = JSON.parse(localStorage.getItem('user'));
            user.name = name;
            localStorage.setItem('user', JSON.stringify(user));
            displayUserInfo();
        } else {
            showNotification(data.error || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showNotification('Network error', 'error');
    }
}

async function updateApplicationStatus(appId, status) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/applications/${appId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification(`Application ${status}!`, 'success');
            await loadDashboardData();
        } else {
            showNotification(data.error || 'Failed to update', 'error');
        }
    } catch (error) {
        console.error('Update application error:', error);
        showNotification('Network error', 'error');
    }
}

async function loadCalendar() {
    const container = document.getElementById('calendarView');
    if (!container) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/calendar/events`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            displayCalendar(data.events);
        }
    } catch (error) {
        console.error('Load calendar error:', error);
        container.innerHTML = '<div class="empty-state">Error loading calendar</div>';
    }
}

function displayCalendar(events) {
    const container = document.getElementById('calendarView');
    if (!container) return;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startOffset = firstDay.getDay();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    let calendarHtml = `
        <div class="calendar-header">
            <button class="btn-secondary" onclick="loadCalendarPrev()">← Prev</button>
            <h2>${monthNames[month]} ${year}</h2>
            <button class="btn-secondary" onclick="loadCalendarNext()">Next →</button>
        </div>
        <div class="calendar-grid">
            <div class="calendar-day-header">Sun</div>
            <div class="calendar-day-header">Mon</div>
            <div class="calendar-day-header">Tue</div>
            <div class="calendar-day-header">Wed</div>
            <div class="calendar-day-header">Thu</div>
            <div class="calendar-day-header">Fri</div>
            <div class="calendar-day-header">Sat</div>
    `;
    
    for (let i = 0; i < startOffset; i++) {
        calendarHtml += `<div class="calendar-day"></div>`;
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.event_date === dateStr);
        
        calendarHtml += `
            <div class="calendar-day">
                <div class="calendar-day-number">${day}</div>
                ${dayEvents.map(e => `<div class="calendar-event ${e.event_type}" onclick="viewEvent(${e.id})">${e.title}</div>`).join('')}
            </div>
        `;
    }
    
    const remainingDays = (7 - ((startOffset + daysInMonth) % 7)) % 7;
    for (let i = 0; i < remainingDays; i++) {
        calendarHtml += `<div class="calendar-day"></div>`;
    }
    
    calendarHtml += `</div>`;
    container.innerHTML = calendarHtml;
}

function saveSettings() {
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const smsNotifications = document.getElementById('smsNotifications').checked;
    localStorage.setItem('emailNotifications', emailNotifications);
    localStorage.setItem('smsNotifications', smsNotifications);
    showNotification('Settings saved!', 'success');
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.updateApplicationStatus = updateApplicationStatus;
window.updateProfile = updateProfile;
window.saveSettings = saveSettings;