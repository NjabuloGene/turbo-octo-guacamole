/**
 * hire-requests.js - View and respond to hire requests
 */

const API_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Only helpers can view hire requests
    if (user.user_role !== 'helper') {
        alert('Only helpers can view hire requests');
        window.location.href = 'index.html';
        return;
    }
    
    await loadHireRequests();
});

async function loadHireRequests() {
    const container = document.getElementById('hireRequestsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading requests...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.hireRequests && data.hireRequests.length > 0) {
            displayRequests(data.hireRequests);
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <div class="empty-title">No hire requests yet</div>
                    <div class="empty-message">When employers send you job offers, they'll appear here</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Load hire requests error:', error);
        container.innerHTML = '<div class="empty-state">Error loading requests. Please refresh.</div>';
    }
}

function displayRequests(requests) {
    const container = document.getElementById('hireRequestsList');
    if (!container) return;
    
    container.innerHTML = requests.map(req => `
        <div class="request-card">
            <div class="request-header">
                <div>
                    <div class="job-title">${escapeHtml(req.job_title || 'Job Opportunity')}</div>
                    <div class="employer-name">From: ${escapeHtml(req.employer_name || 'Employer')}</div>
                </div>
                <div>
                    <span class="status-badge status-${req.status}">${req.status}</span>
                </div>
            </div>
            
            <div class="request-details">
                <p><strong>📅 Start Date:</strong> ${new Date(req.start_date).toLocaleDateString()}</p>
                <p><strong>⏱️ Duration:</strong> ${escapeHtml(req.duration || 'Not specified')}</p>
                <p><strong>💰 Amount:</strong> <span class="amount">R${parseFloat(req.total_amount || req.amount || 0).toFixed(2)}</span></p>
                ${req.message ? `<p><strong>💬 Message:</strong> "${escapeHtml(req.message)}"</p>` : ''}
            </div>
            
            ${req.status === 'pending' ? `
                <div class="action-buttons">
                    <button class="btn-primary" onclick="respondToRequest(${req.id}, 'accepted')">✓ Accept</button>
                    <button class="btn-secondary" onclick="respondToRequest(${req.id}, 'rejected')">✗ Decline</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

async function respondToRequest(requestId, status) {
    if (!confirm(`Are you sure you want to ${status} this request?`)) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/${requestId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Request ${status}!`);
            await loadHireRequests();
        } else {
            alert(data.error || 'Failed to respond');
        }
    } catch (error) {
        console.error('Respond error:', error);
        alert('Network error - please try again');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make function global for onclick
window.respondToRequest = respondToRequest;