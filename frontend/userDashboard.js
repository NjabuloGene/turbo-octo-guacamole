/**
 * dashboard.js - Complete User Dashboard
 */

const API_BASE_URL = 'http://localhost:3000';
let currentUser = null;
let conversations = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // Display user info
    displayUserInfo();
    
    // Load dashboard data
    await loadDashboardData();
    
    // Setup tab navigation
    setupTabs();
    
    // Setup message polling
    startMessagePolling();
});

function displayUserInfo() {
    const avatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    if (avatar) avatar.textContent = currentUser.name.charAt(0).toUpperCase();
    if (userName) userName.textContent = currentUser.name;
    if (userRole) userRole.textContent = currentUser.user_role === 'helper' ? '🧑‍🔧 Helper' : '👔 Hirer';
}

async function loadDashboardData() {
    try {
        await Promise.all([
            loadStats(),
            loadConversations(),
            loadJobs(),
            loadProfileData()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Error loading dashboard data', 'error');
    }
}

async function loadStats() {
    try {
        const token = localStorage.getItem('token');
        
        // Get message count
        const msgResponse = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgResponse.json();
        
        if (msgData.success) {
            const unreadCount = msgData.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
            document.getElementById('messageCount').textContent = msgData.conversations.length;
            if (unreadCount > 0) {
                const badge = document.getElementById('unreadBadge');
                if (badge) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'inline-block';
                }
            }
        }
        
        // Get hire requests count
        const hireResponse = await fetch(`${API_BASE_URL}/api/hire-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const hireData = await hireResponse.json();
        
        if (hireData.success) {
            const pendingCount = hireData.hireRequests.filter(r => r.status === 'pending').length;
            document.getElementById('hireCount').textContent = pendingCount;
        }
        
        // Profile views (would need backend endpoint)
        document.getElementById('profileViews').textContent = '0';
        document.getElementById('totalEarnings').textContent = 'R0';
        
        // Recent activity
        displayRecentActivity();
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadConversations() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            conversations = data.conversations;
            displayConversationsList();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function displayConversationsList() {
    const container = document.getElementById('conversationsListDashboard');
    if (!container) return;
    
    if (!conversations || conversations.length === 0) {
        container.innerHTML = '<div class="empty-state">No messages yet</div>';
        return;
    }
    
    container.innerHTML = conversations.map(conv => `
        <div class="conversation-item-dashboard" onclick="loadConversationMessages(${conv.user_id}, '${conv.user_name}')">
            <div class="conversation-avatar-dashboard">${conv.user_name.charAt(0).toUpperCase()}</div>
            <div class="conversation-info-dashboard">
                <div class="conversation-name-dashboard">${escapeHtml(conv.user_name)}</div>
                <div class="conversation-last-dashboard">${escapeHtml(conv.last_message?.substring(0, 50) || 'No messages')}</div>
            </div>
            ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
        </div>
    `).join('');
}

async function loadConversationMessages(userId, userName) {
    const chatPreview = document.getElementById('chatPreview');
    if (!chatPreview) return;
    
    chatPreview.innerHTML = '<div class="loading-state">Loading messages...</div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            displayMessages(data.messages, userName);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        chatPreview.innerHTML = '<div class="empty-state">Error loading messages</div>';
    }
}

function displayMessages(messages, userName) {
    const chatPreview = document.getElementById('chatPreview');
    if (!chatPreview) return;
    
    if (!messages || messages.length === 0) {
        chatPreview.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
        return;
    }
    
    chatPreview.innerHTML = `
        <h4 style="margin-bottom: 1rem;">Chat with ${escapeHtml(userName)}</h4>
        <div style="max-height: 400px; overflow-y: auto;">
            ${messages.map(msg => `
                <div class="message-item">
                    <div class="message-sender">${msg.sender_id == currentUser.id ? 'You' : escapeHtml(userName)}</div>
                    <div class="message-text">${escapeHtml(msg.message)}</div>
                    <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <input type="text" id="replyMessage" class="form-input" style="flex: 1;" placeholder="Type your reply...">
            <button class="btn-primary" onclick="sendReply(${messages[0]?.sender_id == currentUser.id ? messages[0]?.receiver_id : messages[0]?.sender_id})">Send</button>
        </div>
    `;
}

async function sendReply(receiverId) {
    const message = document.getElementById('replyMessage')?.value.trim();
    if (!message) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                receiver_id: receiverId,
                profile_id: null,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('replyMessage').value = '';
            loadConversations(); // Refresh conversations
            // Reload the current conversation if we know which one
            showNotification('Message sent!', 'success');
        } else {
            showNotification(data.error || 'Failed to send message', 'error');
        }
    } catch (error) {
        console.error('Send message error:', error);
        showNotification('Network error', 'error');
    }
}

async function loadJobs() {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.hireRequests.length > 0) {
            container.innerHTML = data.hireRequests.map(job => `
                <div class="job-card" style="background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${currentUser.user_role === 'helper' ? job.hirer_name : job.helper_name}</strong>
                            <p style="font-size: 0.85rem; color: var(--ink-muted); margin-top: 0.25rem;">Start: ${new Date(job.start_date).toLocaleDateString()}</p>
                            <p style="font-size: 0.85rem; color: var(--ink-muted);">Duration: ${job.duration}</p>
                            ${job.message ? `<p style="font-size: 0.85rem; margin-top: 0.5rem;">"${escapeHtml(job.message)}"</p>` : ''}
                        </div>
                        <div>
                            <span class="status-badge status-${job.status}">${job.status}</span>
                            ${job.status === 'pending' && currentUser.user_role === 'helper' ? `
                                <div style="margin-top: 0.5rem;">
                                    <button class="btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="updateJobStatus(${job.id}, 'accepted')">Accept</button>
                                    <button class="btn-secondary" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onclick="updateJobStatus(${job.id}, 'rejected')">Decline</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="empty-state">No job history yet</div>';
        }
    } catch (error) {
        console.error('Error loading jobs:', error);
        container.innerHTML = '<div class="error-state">Error loading jobs</div>';
    }
}

async function updateJobStatus(jobId, status) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/${jobId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Job ${status}!`, 'success');
            loadJobs(); // Refresh
        } else {
            showNotification(data.error || 'Failed to update job status', 'error');
        }
    } catch (error) {
        console.error('Update job error:', error);
        showNotification('Network error', 'error');
    }
}

async function loadProfileData() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('editName').value = data.user.name || '';
            document.getElementById('editEmail').value = data.user.email || '';
            document.getElementById('editLocation').value = data.user.location || '';
            document.getElementById('editBio').value = data.user.bio || '';
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
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
            // Update local storage
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

function displayRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    // This would come from a backend endpoint
    container.innerHTML = `
        <div class="activity-item" style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
            <span>📊 Your profile was viewed 5 times this week</span>
        </div>
        <div class="activity-item" style="padding: 0.75rem; border-bottom: 1px solid var(--border);">
            <span>💬 You have ${conversations.length} message conversation${conversations.length !== 1 ? 's' : ''}</span>
        </div>
    `;
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
            
            // Refresh data when tab changes
            if (tabName === 'messages') loadConversations();
            if (tabName === 'jobs') loadJobs();
        });
    });
}

function startMessagePolling() {
    setInterval(() => {
        const activeTab = document.querySelector('.dashboard-tab.active');
        if (activeTab && activeTab.id === 'messages-tab') {
            loadConversations();
        }
    }, 10000); // Poll every 10 seconds
}

function saveSettings() {
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const smsNotifications = document.getElementById('smsNotifications').checked;
    
    localStorage.setItem('emailNotifications', emailNotifications);
    localStorage.setItem('smsNotifications', smsNotifications);
    
    showNotification('Settings saved!', 'success');
}

function changePassword() {
    const newPassword = prompt('Enter new password:');
    if (newPassword && newPassword.length >= 6) {
        // Implement password change API call
        alert('Password change feature coming soon!');
    } else if (newPassword) {
        alert('Password must be at least 6 characters');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global functions for onclick handlers
window.sendReply = sendReply;
window.updateJobStatus = updateJobStatus;
window.updateProfile = updateProfile;
window.saveSettings = saveSettings;
window.changePassword = changePassword;
window.loadConversationMessages = loadConversationMessages;