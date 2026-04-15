/**
 * dashboard.js - Complete User Dashboard with Job Management
 * Features: Overview stats, Pending Payments, Active Jobs, Job Management (Start/Complete/Rate)
 * Aligned with index.js backend API
 */

const API_BASE_URL = 'http://localhost:3000';
let currentUser = null;
let pollingInterval = null;

// Calendar state
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let calendarEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));

    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // ── Sync role from DB in case the stored token/user is stale ──────────────
    try {
        const roleRes = await fetch(`${API_BASE_URL}/api/me/role`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const roleData = await roleRes.json();
        if (roleData.success) {
            if (!roleData.match) {
                console.warn(`⚠️ Role mismatch: localStorage='${roleData.tokenRole}' DB='${roleData.dbRole}'. Fixing...`);
            }
            // Always trust the DB role
            currentUser.user_role = roleData.dbRole;
            localStorage.setItem('user', JSON.stringify(currentUser));
        }
    } catch (e) {
        console.warn('Could not sync role from DB:', e);
    }
    // ──────────────────────────────────────────────────────────────────────────

    displayUserInfo();
    await loadDashboardData();
    setupTabs();
    setupTabFromURL();
    startPolling();
});

function displayUserInfo() {
    const avatarEl = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');

    if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = currentUser.name;
    if (roleEl) roleEl.textContent = currentUser.user_role === 'helper' ? '🧑‍🔧 Helper' : '👔 Hirer';
}

async function loadDashboardData() {
    try {
        await loadMessageCount();

        if (currentUser.user_role === 'helper') {
            await loadHelperData();
        } else {
            await loadHirerData();
        }

        await loadProfileData();
    } catch (error) {
        console.error('Load dashboard error:', error);
        showNotification('Error loading dashboard data', 'error');
    }
}

async function loadMessageCount() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const unreadCount = data.conversations.reduce((sum, c) => sum + (parseInt(c.unread_count) || 0), 0);
            const countEl = document.getElementById('messageCount');
            if (countEl) countEl.textContent = data.conversations.length;
            if (unreadCount > 0) {
                const badge = document.getElementById('unreadBadge');
                if (badge) badge.textContent = unreadCount;
            }
        }
    } catch (error) {
        console.error('Load message count error:', error);
    }
}

// ========== HELPER DATA ==========
async function loadHelperData() {
    const token = localStorage.getItem('token');

    // Load job applications submitted by this helper
    try {
        const appRes = await fetch(`${API_BASE_URL}/api/business/my-applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const appData = await appRes.json();
        if (appData.success) {
            const countEl = document.getElementById('applicationCount');
            if (countEl) countEl.textContent = appData.applications.length;
            displayApplications(appData.applications);
        }
    } catch (error) {
        console.error('Load applications error:', error);
    }

    // Load hire requests directed at this helper
    try {
        const hrRes = await fetch(`${API_BASE_URL}/api/hire-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const hrData = await hrRes.json();
        if (hrData.success) {
            displayHireRequests(hrData.hireRequests);
        }
    } catch (error) {
        console.error('Load hire requests error:', error);
    }

    await loadActiveJobs();
}

// ========== HIRER DATA ==========
async function loadHirerData() {
    const token = localStorage.getItem('token');

    // Load job applications received for hirer's posted jobs
    try {
        const jobRes = await fetch(`${API_BASE_URL}/api/business/my-job-applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const jobData = await jobRes.json();
        if (jobData.success) {
            const countEl = document.getElementById('applicationCount');
            if (countEl) countEl.textContent = jobData.applications.length;
            displayJobApplications(jobData.applications);
        }
    } catch (error) {
        console.error('Load job applications error:', error);
    }

    // Load hire requests this hirer sent out
    try {
        const hrRes = await fetch(`${API_BASE_URL}/api/hire-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const hrData = await hrRes.json();
        if (hrData.success) {
            displaySentHireRequests(hrData.hireRequests);
        }
    } catch (error) {
        console.error('Load hire requests error:', error);
    }

    await loadPendingPayments();
    await loadActiveHires();
}

// ========== HIRE REQUESTS (HELPER VIEW) ==========
function displayHireRequests(requests) {
    const container = document.getElementById('hireRequestsList');
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No hire requests yet</div>';
        return;
    }

    container.innerHTML = requests.map(req => `
        <div class="application-card">
            <div class="app-header">
                <div>
                    <h3>${escapeHtml(req.hirer_name)}</h3>
                    <p>📅 Start: ${req.start_date ? new Date(req.start_date).toLocaleDateString() : 'TBD'}</p>
                    <p>⏱️ Duration: ${escapeHtml(req.duration || 'Not specified')}</p>
                    ${req.total_amount ? `<p>💰 Amount: R${parseFloat(req.total_amount).toFixed(2)}</p>` : ''}
                    ${req.message ? `<p>📝 "${escapeHtml(req.message)}"</p>` : ''}
                </div>
                <div>
                    <span class="status-badge status-${req.status}">${req.status}</span>
                    ${req.status === 'pending' ? `
                        <div style="margin-top:0.5rem; display:flex; gap:0.5rem; flex-direction:column;">
                            <button class="btn-primary" onclick="respondToHireRequest(${req.id}, 'accepted')">✅ Accept</button>
                            <button class="btn-secondary" onclick="respondToHireRequest(${req.id}, 'rejected')">❌ Decline</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// ========== HIRE REQUESTS (HIRER VIEW) ==========
function displaySentHireRequests(requests) {
    const container = document.getElementById('sentHireRequestsList');
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-state">No hire requests sent yet</div>';
        return;
    }

    container.innerHTML = requests.map(req => `
        <div class="application-card">
            <div class="app-header">
                <div>
                    <h3>${escapeHtml(req.helper_name || req.profile_name || 'Helper')}</h3>
                    <p>📅 Start: ${req.start_date ? new Date(req.start_date).toLocaleDateString() : 'TBD'}</p>
                    <p>⏱️ Duration: ${escapeHtml(req.duration || 'Not specified')}</p>
                    ${req.total_amount ? `<p>💰 Amount: R${parseFloat(req.total_amount).toFixed(2)}</p>` : ''}
                </div>
                <div>
                    <span class="status-badge status-${req.status}">${req.status}</span>
                    <p class="app-time">${new Date(req.created_at).toLocaleDateString()}</p>
                    ${req.status === 'accepted' ? `
                        <button class="pay-now-btn" style="margin-top:0.5rem"
                            onclick="payForRequest(${req.id}, ${parseFloat(req.total_amount || 0)}, ${req.helper_id || 'null'})">
                            💳 Pay Now
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

window.respondToHireRequest = async function(requestId, status) {
    const verb = status === 'accepted' ? 'accept' : 'decline';
    if (!confirm(`Are you sure you want to ${verb} this hire request?`)) return;

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
            showNotification(`Hire request ${status}!`, 'success');
            await loadHelperData();
        } else {
            showNotification(data.error || 'Failed to update request', 'error');
        }
    } catch (error) {
        console.error('Respond to hire request error:', error);
        showNotification('Network error', 'error');
    }
};

// ========== PENDING PAYMENTS (HIRER) ==========
async function loadPendingPayments() {
    const container = document.getElementById('pendingPaymentsList');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading pending payments...</p></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/pending-payments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
            console.error(`❌ pending-payments ${response.status}:`, data);
            container.innerHTML = `<div class="error-state">Error ${response.status}: ${data.error || 'Unknown error'}<br><small>Your role: ${data.yourRole || currentUser.user_role}</small></div>`;
            return;
        }

        if (data.success && data.payments && data.payments.length > 0) {
            displayPendingPayments(data.payments);
            updatePaymentsBadge(data.payments.length);
        } else {
            container.innerHTML = '<div class="empty-state">No pending payments</div>';
            updatePaymentsBadge(0);
        }
    } catch (error) {
        console.error('Load pending payments error:', error);
        container.innerHTML = '<div class="error-state">Error loading pending payments</div>';
    }
}

function updatePaymentsBadge(count) {
    const paymentsTab = document.querySelector('.dashboard-nav-item[data-tab="payments"]');
    if (!paymentsTab) return;
    let badge = paymentsTab.querySelector('.tab-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tab-badge';
            paymentsTab.appendChild(badge);
        }
        badge.textContent = count;
        badge.style.cssText = 'background:#e67e22;color:white;border-radius:50%;padding:0.1rem 0.4rem;font-size:0.7rem;margin-left:0.5rem;';
    } else if (badge) {
        badge.remove();
    }
}

function displayPendingPayments(payments) {
    const container = document.getElementById('pendingPaymentsList');
    if (!container) return;

    container.innerHTML = payments.map(payment => `
        <div class="pending-payment-card" data-request-id="${payment.id}">
            <div class="payment-header">
                <div>
                    <h3>${escapeHtml(payment.helper_name)}</h3>
                    <p>📅 Start: ${payment.start_date ? new Date(payment.start_date).toLocaleDateString() : 'TBD'}</p>
                    <p>⏱️ Duration: ${escapeHtml(payment.duration || 'Not specified')}</p>
                    ${payment.schedule ? `<p>📋 Schedule: ${safeParseJson(payment.schedule, []).length} day(s)</p>` : ''}
                </div>
                <div class="payment-amount">
                    <div class="amount-large">R${parseFloat(payment.total_amount || 0).toFixed(2)}</div>
                    <div class="countdown-timer">
                        <span class="timer-label">Time remaining to pay:</span>
                        <span class="timer-display" id="timer-${payment.id}">Calculating...</span>
                    </div>
                    <button class="pay-now-btn"
                        onclick="payForRequest(${payment.id}, ${parseFloat(payment.total_amount || 0)}, ${payment.helper_user_id || 'null'})">
                        💳 Pay Now
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    // Start countdown timers (10 min window from acceptance)
    payments.forEach(payment => {
        startCountdown(payment.accepted_at || payment.updated_at, payment.id);
    });
}

function startCountdown(acceptedAt, requestId) {
    if (!acceptedAt) {
        const el = document.getElementById(`timer-${requestId}`);
        if (el) el.textContent = 'No timer available';
        return;
    }

    const expiryTime = new Date(acceptedAt).getTime() + (10 * 60 * 1000); // 10 minutes

    function updateTimer() {
        const remaining = expiryTime - Date.now();
        const timerEl = document.getElementById(`timer-${requestId}`);
        if (!timerEl) return; // Element removed from DOM

        if (remaining <= 0) {
            timerEl.innerHTML = '⚠️ Expired';
            timerEl.parentElement.classList.add('expired');
            const card = timerEl.closest('.pending-payment-card');
            if (card) {
                const btn = card.querySelector('.pay-now-btn');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Payment window expired';
                }
            }
            return;
        }

        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        timerEl.innerHTML = `${minutes}m ${seconds}s`;

        // Warn when under 2 minutes
        if (remaining < 120000) timerEl.style.color = '#e74c3c';

        setTimeout(updateTimer, 1000);
    }

    updateTimer();
}

// ========== ACTIVE JOBS (HELPER) ==========
async function loadActiveJobs() {
    const container = document.getElementById('activeJobsList');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading active jobs...</p></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/my-active-jobs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && data.jobs && data.jobs.length > 0) {
            displayActiveJobsForHelper(data.jobs);
        } else {
            container.innerHTML = '<div class="empty-state">No active jobs</div>';
        }
    } catch (error) {
        console.error('Load active jobs error:', error);
        container.innerHTML = '<div class="error-state">Error loading active jobs</div>';
    }
}

function displayActiveJobsForHelper(jobs) {
    const container = document.getElementById('activeJobsList');
    if (!container) return;

    container.innerHTML = jobs.map(job => `
        <div class="active-job-card">
            <div class="job-header">
                <div>
                    <h3>${escapeHtml(job.hirer_name || 'Hirer')}</h3>
                    <p>📅 Start: ${job.start_date ? new Date(job.start_date).toLocaleDateString() : 'TBD'}</p>
                    <p>⏱️ Duration: ${escapeHtml(job.duration || 'Not specified')}</p>
                    <p>💰 Amount: R${parseFloat(job.total_amount || 0).toFixed(2)}</p>
                    <p>📊 Status: <span class="status-badge status-${job.status}">${formatStatus(job.status)}</span></p>
                </div>
                <div class="job-actions">
                    ${job.status === 'paid' ? `
                        <button class="btn-primary" onclick="startJob(${job.id})">▶️ Start Job</button>
                    ` : ''}
                    ${job.status === 'in_progress' ? `
                        <button class="btn-primary" onclick="completeJob(${job.id})">✅ Complete Job</button>
                    ` : ''}
                    ${job.status === 'completed' ? `
                        <div class="rating-info">⏳ Waiting for hirer to rate</div>
                    ` : ''}
                    ${job.status === 'rated' ? `
                        <div class="rated-info">⭐ Rated! Thank you</div>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// ========== ACTIVE HIRES (HIRER) ==========
async function loadActiveHires() {
    const container = document.getElementById('activeHiresList');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading active hires...</p></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/my-active-hires`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && data.jobs && data.jobs.length > 0) {
            displayActiveHires(data.jobs);
        } else {
            container.innerHTML = '<div class="empty-state">No active hires</div>';
        }
    } catch (error) {
        console.error('Load active hires error:', error);
        container.innerHTML = '<div class="error-state">Error loading active hires</div>';
    }
}

function displayActiveHires(jobs) {
    const container = document.getElementById('activeHiresList');
    if (!container) return;

    container.innerHTML = jobs.map(job => `
        <div class="active-job-card">
            <div class="job-header">
                <div>
                    <h3>${escapeHtml(job.helper_name || 'Helper')}</h3>
                    <p>📅 Start: ${job.start_date ? new Date(job.start_date).toLocaleDateString() : 'TBD'}</p>
                    <p>⏱️ Duration: ${escapeHtml(job.duration || 'Not specified')}</p>
                    <p>💰 Amount: R${parseFloat(job.total_amount || 0).toFixed(2)}</p>
                    <p>📊 Status: <span class="status-badge status-${job.status}">${formatStatus(job.status)}</span></p>
                </div>
                <div class="job-actions">
                    ${job.status === 'completed' ? `
                        <div class="rating-section" data-job-id="${job.id}">
                            <label>Rate Helper:</label>
                            <div class="star-rating" id="stars-${job.id}">
                                ${[1,2,3,4,5].map(star => `
                                    <span class="star" data-rating="${star}" data-job="${job.id}">☆</span>
                                `).join('')}
                            </div>
                            <textarea id="review-${job.id}" placeholder="Leave a review (optional)"
                                style="margin-top:0.5rem;width:100%;padding:0.4rem;border-radius:6px;border:1px solid #ccc;font-size:0.85rem;resize:vertical;" rows="2"></textarea>
                            <button class="btn-primary" style="margin-top:0.5rem"
                                onclick="submitRating(${job.id})">Submit Rating</button>
                        </div>
                    ` : ''}
                    ${job.status === 'rated' ? `
                        <div class="rated-info">⭐ Rated ${job.helper_rating || ''} stars. Thank you!</div>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');

    // Star hover effects - attach after rendering
    attachStarHandlers();
}

function attachStarHandlers() {
    document.querySelectorAll('.star-rating').forEach(ratingContainer => {
        const stars = ratingContainer.querySelectorAll('.star');

        stars.forEach(star => {
            star.addEventListener('mouseenter', function () {
                const rating = parseInt(this.dataset.rating);
                stars.forEach((s, i) => s.textContent = i < rating ? '★' : '☆');
            });

            star.addEventListener('mouseleave', function () {
                const selected = ratingContainer.dataset.selected;
                stars.forEach((s, i) => s.textContent = selected && i < parseInt(selected) ? '★' : '☆');
            });

            star.addEventListener('click', function () {
                const rating = parseInt(this.dataset.rating);
                ratingContainer.dataset.selected = rating;
                stars.forEach((s, i) => s.textContent = i < rating ? '★' : '☆');
            });
        });
    });
}

// Reads the selected star rating from the container, then submits
window.submitRating = async function(jobId) {
    const starsContainer = document.getElementById(`stars-${jobId}`);
    const rating = parseInt(starsContainer?.dataset.selected || '0');
    const review = document.getElementById(`review-${jobId}`)?.value || '';

    if (!rating || rating < 1 || rating > 5) {
        showNotification('Please select a star rating first', 'error');
        return;
    }

    await rateHelper(jobId, rating, review);
};

// ========== JOB MANAGEMENT ACTIONS ==========

/**
 * payForRequest — creates a PayFast payment and redirects.
 * NOTE: payment-success is NOT called immediately here.
 * The backend IPN (/api/payfast/ipn) handles confirming real payment.
 * payment-success is only called if you want to optimistically mark it
 * after the user returns from PayFast (unreliable — IPN is authoritative).
 */
window.payForRequest = async function(requestId, amount, helperId) {
    if (!amount || amount <= 0) {
        showNotification('Invalid payment amount', 'error');
        return;
    }

    if (!confirm(`Pay R${parseFloat(amount).toFixed(2)} for this hire request?`)) return;

    try {
        const token = localStorage.getItem('token');
        const payload = {
            amount: parseFloat(amount),
            item_name: `Hire Request #${requestId}`,
            item_description: `Payment for hire request ${requestId}`,
            job_id: requestId,
            candidate_id: helperId || null
        };

        console.log('📤 Sending to /api/payfast/create:', payload);

        const response = await fetch(`${API_BASE_URL}/api/payfast/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 PayFast create response:', data);

        if (!response.ok) {
            showNotification(data.error || `Server error ${response.status}`, 'error');
            return;
        }

        if (data.success && data.formData && data.payfastUrl) {
            // Log every field that will be submitted so we can debug signature issues
            console.log('📋 PayFast form fields being submitted:');
            Object.entries(data.formData).forEach(([k, v]) => console.log(`  ${k} = "${v}"`));
            console.log('🔗 Submitting to:', data.payfastUrl);

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = data.payfastUrl;
            form.target = '_self';

            Object.entries(data.formData).forEach(([key, value]) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = value;
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
        } else {
            showNotification(data.error || 'Payment initialization failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Payment error:', error);
        showNotification('Payment system error. Please try again later.', 'error');
    }
};

window.startJob = async function(requestId) {
    if (!confirm('Start this job? The hirer will be notified.')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/${requestId}/start`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Job started!', 'success');
            await loadActiveJobs();
        } else {
            showNotification(data.error || 'Failed to start job', 'error');
        }
    } catch (error) {
        console.error('Start job error:', error);
        showNotification('Network error', 'error');
    }
};

window.completeJob = async function(requestId) {
    if (!confirm('Mark this job as completed? The hirer will be notified to leave a rating.')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/${requestId}/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            showNotification('Job completed! Waiting for hirer to rate.', 'success');
            await loadActiveJobs();
        } else {
            showNotification(data.error || 'Failed to complete job', 'error');
        }
    } catch (error) {
        console.error('Complete job error:', error);
        showNotification('Network error', 'error');
    }
};

async function rateHelper(requestId, rating, review = '') {
    if (!confirm(`Submit a ${rating}-star rating?`)) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/hire-requests/${requestId}/rate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating, review })
        });

        const data = await response.json();
        if (data.success) {
            showNotification(`Rated ${rating} stars! Thank you!`, 'success');
            await loadActiveHires();
        } else {
            showNotification(data.error || 'Failed to submit rating', 'error');
        }
    } catch (error) {
        console.error('Rate error:', error);
        showNotification('Network error', 'error');
    }
}

// ========== PROFILE MANAGEMENT ==========
async function loadProfileData() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            const nameEl = document.getElementById('editName');
            const emailEl = document.getElementById('editEmail');
            const locationEl = document.getElementById('editLocation');
            const bioEl = document.getElementById('editBio');
            if (nameEl) nameEl.value = data.user.name || '';
            if (emailEl) emailEl.value = data.user.email || '';
            if (locationEl) locationEl.value = data.user.location || '';
            if (bioEl) bioEl.value = data.user.bio || '';
        }
    } catch (error) {
        console.error('Load profile error:', error);
    }
}

window.updateProfile = async function() {
    const name = document.getElementById('editName')?.value?.trim();
    const location = document.getElementById('editLocation')?.value?.trim();
    const bio = document.getElementById('editBio')?.value?.trim();

    if (!name) {
        showNotification('Name is required', 'error');
        return;
    }

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
            currentUser.name = name;
            displayUserInfo();
        } else {
            showNotification(data.error || 'Failed to update profile', 'error');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showNotification('Network error', 'error');
    }
};

// ========== APPLICATIONS DISPLAY ==========
function displayApplications(applications) {
    const container = document.getElementById('applicationsList');
    if (!container) return;

    if (!applications || applications.length === 0) {
        container.innerHTML = '<div class="empty-state">No applications yet. <a href="jobs.html">Browse jobs →</a></div>';
        return;
    }

    container.innerHTML = applications.map(app => `
        <div class="application-card">
            <div class="app-header">
                <div>
                    <h3>${escapeHtml(app.title)}</h3>
                    <p>${escapeHtml(app.company_name)}</p>
                    <p>💰 ${app.salary_min ? `R${app.salary_min} - R${app.salary_max}` : 'Salary not specified'}</p>
                    <p>📍 ${escapeHtml(app.location || 'Remote')}</p>
                </div>
                <div>
                    <span class="status-badge status-${app.status}">${formatStatus(app.status)}</span>
                    <p class="app-time">Applied: ${new Date(app.created_at).toLocaleDateString()}</p>
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
            <div class="app-header">
                <div>
                    <h3>${escapeHtml(app.candidate_name)}</h3>
                    <p>${escapeHtml(app.role || 'Professional')} • ${escapeHtml(app.job_title || '')}</p>
                    <p>⭐ ${app.rating ? parseFloat(app.rating).toFixed(1) : 'No rating'} • 📅 ${escapeHtml(app.experience || '0 months')}</p>
                    <p>💰 Expected: ${app.expected_salary ? `R${app.expected_salary}` : 'Not specified'}</p>
                    ${app.cover_letter ? `<p class="cover-letter">📝 "${escapeHtml(app.cover_letter.substring(0, 150))}${app.cover_letter.length > 150 ? '...' : ''}"</p>` : ''}
                </div>
                <div>
                    <select class="status-select" onchange="updateApplicationStatus(${app.id}, this.value)">
                        <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="reviewed" ${app.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                        <option value="shortlisted" ${app.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                        <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reject</option>
                        <option value="hired" ${app.status === 'hired' ? 'selected' : ''}>Hire ✅</option>
                    </select>
                    <p class="app-time">Applied: ${new Date(app.created_at).toLocaleDateString()}</p>
                    <a href="profile.html?id=${app.candidate_id}" class="btn-secondary" style="display:inline-block;margin-top:0.4rem;font-size:0.8rem;">View Profile</a>
                </div>
            </div>
        </div>
    `).join('');
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsList');
    if (!container) return;

    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">No jobs posted yet. <a href="post-job.html">Post a job →</a></div>';
        return;
    }

    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <div class="job-header">
                <div>
                    <h3>${escapeHtml(job.title)}</h3>
                    <p>${escapeHtml(job.employment_type || 'Full-time')} • ${escapeHtml(job.location || 'Remote')}</p>
                    <p>💰 R${job.salary_min || 0} - R${job.salary_max || 0}</p>
                    <p>${escapeHtml(job.description?.substring(0, 100) || '')}${job.description?.length > 100 ? '...' : ''}</p>
                </div>
                <div>
                    <span class="status-badge status-${job.status}">${formatStatus(job.status)}</span>
                    <p class="job-time">Posted: ${new Date(job.created_at).toLocaleDateString()}</p>
                    <p>👁️ ${job.view_count || 0} views • 📋 ${job.application_count || 0} applications</p>
                </div>
            </div>
        </div>
    `).join('');
}

window.updateApplicationStatus = async function(appId, status) {
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
            // Reload relevant sections
            const jobRes = await fetch(`${API_BASE_URL}/api/business/my-job-applications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const jobData = await jobRes.json();
            if (jobData.success) displayJobApplications(jobData.applications);
        } else {
            showNotification(data.error || 'Failed to update', 'error');
        }
    } catch (error) {
        console.error('Update application error:', error);
        showNotification('Network error', 'error');
    }
};

// ========== CALENDAR ==========
async function loadCalendar() {
    const container = document.getElementById('calendarView');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading calendar...</p></div>';

    try {
        const token = localStorage.getItem('token');
        const firstDay = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
        const lastDayStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

        const response = await fetch(
            `${API_BASE_URL}/api/calendar/events?start_date=${firstDay}&end_date=${lastDayStr}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const data = await response.json();

        calendarEvents = data.success ? data.events : [];
        displayCalendar(calendarEvents);
    } catch (error) {
        console.error('Load calendar error:', error);
        container.innerHTML = '<div class="error-state">Error loading calendar</div>';
    }
}

function displayCalendar(events) {
    const container = document.getElementById('calendarView');
    if (!container) return;

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startOffset = firstDay.getDay();

    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    let calendarHtml = `
        <div class="calendar-header">
            <button class="btn-secondary" onclick="navigateCalendar(-1)">← Prev</button>
            <h2>${monthNames[calendarMonth]} ${calendarYear}</h2>
            <button class="btn-secondary" onclick="navigateCalendar(1)">Next →</button>
        </div>
        <div class="calendar-grid">
            ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="calendar-day-header">${d}</div>`).join('')}
    `;

    // Empty cells before the 1st
    for (let i = 0; i < startOffset; i++) {
        calendarHtml += `<div class="calendar-day empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = events.filter(e => e.event_date && e.event_date.startsWith(dateStr));
        const isToday = dateStr === new Date().toISOString().split('T')[0];

        calendarHtml += `
            <div class="calendar-day${isToday ? ' today' : ''}">
                <div class="calendar-day-number">${day}</div>
                ${dayEvents.map(e => `
                    <div class="calendar-event ${escapeHtml(e.event_type || '')}"
                         onclick="viewEvent(${e.id})"
                         title="${escapeHtml(e.title)}">
                        ${escapeHtml(e.title)}
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Fill remaining cells to complete the last row
    const totalCells = startOffset + daysInMonth;
    const remainingDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remainingDays; i++) {
        calendarHtml += `<div class="calendar-day empty"></div>`;
    }

    calendarHtml += `</div>`;
    container.innerHTML = calendarHtml;
}

window.navigateCalendar = function(direction) {
    calendarMonth += direction;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    if (calendarMonth < 0)  { calendarMonth = 11; calendarYear--; }
    loadCalendar();
};

// Keep old names working if any HTML references them
window.loadCalendarPrev = () => window.navigateCalendar(-1);
window.loadCalendarNext = () => window.navigateCalendar(1);

window.viewEvent = function(id) {
    const event = calendarEvents.find(e => e.id === id);
    if (!event) return;
    alert(`📅 ${event.title}\n🕐 ${event.start_time || ''} - ${event.end_time || ''}\n📝 ${event.notes || 'No notes'}`);
};

// ========== SETTINGS ==========
window.saveSettings = function() {
    const emailNotifications = document.getElementById('emailNotifications')?.checked;
    const smsNotifications = document.getElementById('smsNotifications')?.checked;
    localStorage.setItem('emailNotifications', emailNotifications);
    localStorage.setItem('smsNotifications', smsNotifications);
    showNotification('Settings saved!', 'success');
};

// ========== TAB MANAGEMENT ==========
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

            const targetTab = document.getElementById(`${tabName}-tab`);
            if (targetTab) targetTab.classList.add('active');

            // Lazy-load data when switching tabs
            switch (tabName) {
                case 'payments':   loadPendingPayments(); break;
                case 'activejobs': loadActiveJobs(); break;
                case 'activehires': loadActiveHires(); break;
                case 'calendar':   loadCalendar(); break;
            }

            const url = new URL(window.location);
            url.searchParams.set('tab', tabName);
            window.history.pushState({}, '', url);
        });
    });
}

function setupTabFromURL() {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam) {
        const tabLink = document.querySelector(`.dashboard-nav-item[data-tab="${tabParam}"]`);
        if (tabLink) tabLink.click();
    }
}

// ========== POLLING ==========
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // Refresh message badge
            await loadMessageCount();

            // Hirers: refresh pending payment badge and list if on that tab
            if (currentUser.user_role === 'hirer') {
                const response = await fetch(`${API_BASE_URL}/api/hire-requests/pending-payments`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (data.success) {
                    updatePaymentsBadge(data.payments?.length || 0);
                    // If the user is currently on the payments tab, refresh it
                    const activeTab = document.querySelector('.dashboard-tab.active');
                    if (activeTab?.id === 'payments-tab') displayPendingPayments(data.payments || []);
                }
            }

            // Helpers: check for new hire requests
            if (currentUser.user_role === 'helper') {
                const activeTab = document.querySelector('.dashboard-tab.active');
                if (activeTab?.id === 'activejobs-tab') await loadActiveJobs();
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 30000); // every 30 seconds
}

// ========== UTILITIES ==========
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    const colours = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
    notification.style.cssText = `
        position:fixed;bottom:20px;right:20px;
        background:${colours[type] || colours.info};
        color:white;padding:12px 24px;border-radius:8px;
        z-index:2000;box-shadow:0 4px 12px rgba(0,0,0,0.15);
        font-family:'DM Sans',sans-serif;font-size:0.9rem;
        animation:slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3500);
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatStatus(status) {
    if (!status) return '';
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function safeParseJson(str, fallback) {
    try { return JSON.parse(str); } catch (_) { return fallback; }
}

// Expose rateHelper globally (called by submitRating)
window.rateHelper = rateHelper;