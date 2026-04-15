/**
 * notifications.js - Real-time notification system
 */

let notificationInterval = null;
let lastNotificationCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        startNotificationPolling();
        // Request notification permission
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
});

function startNotificationPolling() {
    if (notificationInterval) clearInterval(notificationInterval);
    
    notificationInterval = setInterval(async () => {
        try {
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user'));
            
            if (!token || !user) return;
            
            let totalNotifications = 0;
            
            // Check for pending hire requests (for helpers)
            if (user.user_role === 'helper') {
                const hireRes = await fetch('http://localhost:3000/api/hire-requests', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const hireData = await hireRes.json();
                if (hireData.success && hireData.hireRequests) {
                    const pending = hireData.hireRequests.filter(r => r.status === 'pending').length;
                    totalNotifications += pending;
                    
                    // Update badge in navbar
                    updateNavbarBadge('hireRequestsBadge', pending);
                }
            }
            
            // Check for unread messages
            const msgRes = await fetch('http://localhost:3000/api/messages/unread/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const msgData = await msgRes.json();
            if (msgData.success) {
                totalNotifications += msgData.unreadCount;
                updateNavbarBadge('messageBadge', msgData.unreadCount);
            }
            
            // Show browser notification if new notifications arrived
            if (totalNotifications > lastNotificationCount) {
                const newCount = totalNotifications - lastNotificationCount;
                if (Notification.permission === 'granted') {
                    new Notification('Helper.request', {
                        body: `You have ${newCount} new notification${newCount > 1 ? 's' : ''}!`,
                        icon: '/favicon.ico'
                    });
                }
            }
            
            lastNotificationCount = totalNotifications;
            
        } catch (error) {
            console.error('Notification polling error:', error);
        }
    }, 15000); // Check every 15 seconds
}

function updateNavbarBadge(badgeId, count) {
    const badge = document.getElementById(badgeId);
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'svc-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'info' ? '#3b82f6' : '#10b981'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Add this to your HTML pages (in the navbar area)
// <span id="hireRequestsBadge" class="notification-badge" style="display: none;"></span>
// <span id="messageBadge" class="notification-badge" style="display: none;"></span>