// elderlyCare.js - Complete file with full functionality

console.log('🚀 Elderly Care JS loaded');

const API_BASE_URL = 'http://localhost:3000';
let allProfiles = [];
let savedProfileIds = new Set();

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM Content Loaded');
    
    const grid = document.getElementById('profilesGrid');
    
    if (!grid) {
        console.error('❌ Could not find profilesGrid element!');
        return;
    }
    
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    // Load saved profiles if user is a hirer
    if (user.user_role === 'hirer') {
        loadSavedProfiles();
    }
    
    // Show loading
    showLoading();
    
    // Load profiles
    loadProfiles();
    
    // Setup search and filters
    setupSearch();
    setupFilterChips();
});

async function loadSavedProfiles() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/saved-profiles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            savedProfileIds = new Set(data.savedProfiles.map(p => p.id));
        }
    } catch (error) {
        console.error('Load saved profiles error:', error);
    }
}

async function loadProfiles() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/profiles?service=nurses`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Raw profile data:', data);
        
        if (data.success && data.profiles.length > 0) {
            allProfiles = data.profiles;
            displayProfiles(allProfiles);
            updateResultsCount(allProfiles.length);
        } else {
            showNoProfiles();
        }
    } catch (error) {
        console.error('❌ Error loading profiles:', error);
        showError('Failed to load profiles. Please try again.');
    }
}

function displayProfiles(profiles) {
    const grid = document.getElementById('profilesGrid');
    if (!grid) return;
    
    if (!profiles || profiles.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">👵</div><div class="empty-title">No caregivers found</div><div class="empty-message">Be the first to create a profile!</div></div>';
        return;
    }
    
    let html = '<div class="cards-grid">';
    profiles.forEach(profile => {
        html += createProfileCard(profile);
    });
    html += '</div>';
    
    grid.innerHTML = html;
}

function createProfileCard(profile) {
    // Safely handle rating
    let rating = profile.rating || 4.0;
    rating = parseFloat(rating);
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const stars = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0));
    
    // Get initials for avatar placeholder (2 letters)
    const nameParts = profile.name.split(' ');
    const initials = (nameParts[0].charAt(0) + (nameParts[1] ? nameParts[1].charAt(0) : nameParts[0].charAt(1))).toUpperCase();
    const profileImage = profile.profile_pic || '';
    
    // Format experience
    const experience = profile.experience || '0 months';
    const location = profile.location || 'Location not set';
    const rate = profile.rate || 'R200/hour';
    const role = profile.role || 'Elderly Care Specialist';
    
    // Truncate bio
    let bioText = profile.bio || 'No bio provided';
    if (bioText.length > 100) {
        bioText = bioText.substring(0, 100) + '...';
    }
    
    // Check for badges
    const isTopRated = rating >= 4.5;
    const hasVideo = profile.video ? true : false;
    const hasDocuments = profile.documents && profile.documents.length > 0;
    const isSaved = savedProfileIds.has(profile.id);
    
    const user = JSON.parse(localStorage.getItem('user'));
    const isHirer = user?.user_role === 'hirer';
    
    return `
        <div class="helper-card" data-profile-id="${profile.id}" data-user-id="${profile.user_id}">
            <div class="card-header" onclick="viewProfileDetails(${profile.id})">
                ${profileImage ? 
                    `<img src="${profileImage}" class="card-avatar" alt="${profile.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff&size=200'">` :
                    `<div class="card-avatar-placeholder" style="background: linear-gradient(135deg, #00938a, #006f68); color: white; font-weight: 600; display: flex; align-items: center; justify-content: center;">${initials}</div>`
                }
                <div class="card-info">
                    <div class="card-name">${escapeHtml(profile.name)}</div>
                    <div class="card-role">${escapeHtml(role)}</div>
                    <div class="card-rate">${escapeHtml(rate)}</div>
                </div>
            </div>
            
            <div class="card-body" onclick="viewProfileDetails(${profile.id})">
                <div class="card-bio">${escapeHtml(bioText)}</div>
                <div class="card-meta">
                    <div class="meta-item"><span class="icon">📍</span> ${escapeHtml(location)}</div>
                    <div class="meta-item"><span class="icon">📅</span> ${escapeHtml(experience)}</div>
                    <div class="meta-item"><span class="icon">⭐</span> ${rating.toFixed(1)}</div>
                </div>
                <div class="card-badges">
                    ${isTopRated ? '<span class="badge top-rated">⭐ Top Rated</span>' : ''}
                    ${hasVideo ? '<span class="badge video">🎥 Video</span>' : ''}
                    ${hasDocuments ? '<span class="badge verified">📄 Verified</span>' : ''}
                </div>
            </div>
            
            <div class="card-actions">
                <button class="action-btn btn-view" onclick="event.stopPropagation(); viewProfileDetails(${profile.id})">
                    View Profile
                </button>
                ${isHirer ? `
                    <button class="action-btn btn-message" onclick="event.stopPropagation(); openMessageModal(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                        💬 Message
                    </button>
                    <button class="action-btn btn-hire" onclick="event.stopPropagation(); openHireModal(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                        🤝 Hire
                    </button>
                    <button class="action-btn btn-bookmark ${isSaved ? 'saved' : ''}" onclick="event.stopPropagation(); toggleSave(${profile.id})">
                        ${isSaved ? '★ Saved' : '☆ Bookmark'}
                    </button>
                ` : `
                    <button class="action-btn btn-contact" onclick="event.stopPropagation(); contactHelper(${profile.user_id}, '${escapeHtml(profile.name)}')">
                        Contact
                    </button>
                `}
            </div>
        </div>
    `;
}

// ========== VIEW PROFILE MODAL ==========
async function viewProfileDetails(profileId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/profiles/${profileId}`, {
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
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    let rating = profile.rating || 4.0;
    rating = parseFloat(rating);
    const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    
    const profileImage = profile.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff&size=200`;
    
    // Interview results section
    let interviewHtml = '';
    if (profile.interview_results && profile.interview_results.length > 0) {
        interviewHtml = `
            <div class="profile-section">
                <h3>📋 Interview Results</h3>
                <div class="interview-stats">
                    <div class="stat-card">
                        <span class="stat-value">${profile.interview_results[0]?.total_score || 'N/A'}%</span>
                        <span class="stat-label">Overall Score</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-value">${profile.interview_results.length}</span>
                        <span class="stat-label">Interviews</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Photos gallery
    let photosHtml = '';
    if (profile.photos && profile.photos.length > 0) {
        photosHtml = `
            <div class="profile-section">
                <h3>📸 Experience Photos</h3>
                <div class="gallery-grid">
                    ${profile.photos.map(photo => `
                        <img src="${photo}" class="gallery-image" onclick="window.open('${photo}', '_blank')" alt="Experience photo">
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Documents
    let documentsHtml = '';
    if (profile.documents && profile.documents.length > 0) {
        documentsHtml = `
            <div class="profile-section">
                <h3>📄 Documents & Certificates</h3>
                <div class="documents-list">
                    ${profile.documents.map(doc => `
                        <a href="${doc}" target="_blank" class="document-link">
                            📄 ${doc.split('/').pop()}
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Video
    let videoHtml = '';
    if (profile.video) {
        videoHtml = `
            <div class="profile-section">
                <h3>🎥 Introduction Video</h3>
                <video src="${profile.video}" controls style="width: 100%; border-radius: 12px;"></video>
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2>${escapeHtml(profile.name)}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="profile-detail-header">
                    <img src="${profileImage}" alt="${profile.name}" class="profile-detail-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff'">
                    <div class="profile-detail-info">
                        <div class="profile-detail-role">${profile.role || 'Professional'}</div>
                        <div class="profile-detail-name">${escapeHtml(profile.name)}</div>
                        <div class="rating-stars">${stars}</div>
                        <div class="profile-detail-meta">
                            <div class="meta-item"><span class="icon">📍</span> ${profile.location || 'Location not set'}</div>
                            <div class="meta-item"><span class="icon">💰</span> ${profile.rate || 'R200/hour'}</div>
                            <div class="meta-item"><span class="icon">📅</span> ${profile.experience || '0 months'} experience</div>
                        </div>
                    </div>
                </div>
                
                <div class="profile-detail-bio">
                    <h3>About</h3>
                    <p>${profile.bio || 'No bio provided.'}</p>
                </div>
                
                ${interviewHtml}
                ${photosHtml}
                ${documentsHtml}
                ${videoHtml}
            </div>
            <div class="modal-actions">
                <button class="action-btn btn-message" onclick="openMessageModal(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                    💬 Message
                </button>
                <button class="action-btn btn-hire" onclick="openHireModal(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                    🤝 Hire
                </button>
                <button class="action-btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ========== MESSAGE MODAL ==========
function openMessageModal(receiverId, profileId, receiverName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Message ${escapeHtml(receiverName)}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <textarea id="messageText" rows="5" placeholder="Type your message here..." 
                    style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); font-family:inherit; resize:vertical;"></textarea>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" id="sendMessageBtn">Send Message</button>
                <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('sendMessageBtn').onclick = async () => {
        const message = document.getElementById('messageText')?.value;
        if (!message) {
            alert('Please enter a message');
            return;
        }
        
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
                    profile_id: profileId,
                    message: message
                })
            });
            
            const data = await response.json();
            if (data.success) {
                alert('Message sent!');
                modal.remove();
            } else {
                alert(data.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('Send message error:', error);
            alert('Network error');
        }
    };
}

// ========== HIRE MODAL ==========
function openHireModal(helperId, profileId, helperName) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultDate = tomorrow.toISOString().split('T')[0];
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Hire ${escapeHtml(helperName)}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Start Date *</label>
                    <input type="date" id="startDate" value="${defaultDate}" style="width:100%; padding:10px; border-radius:8px;">
                </div>
                <div class="form-group">
                    <label>Duration / Hours</label>
                    <input type="text" id="duration" placeholder="e.g., 4 hours, 1 week, ongoing" style="width:100%; padding:10px; border-radius:8px;">
                </div>
                <div class="form-group">
                    <label>Message (optional)</label>
                    <textarea id="hireMessage" rows="3" placeholder="Tell ${helperName} about your needs..." style="width:100%; padding:12px; border-radius:8px; resize:vertical;"></textarea>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" id="submitHireBtn">Send Hire Request</button>
                <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('submitHireBtn').onclick = async () => {
        const startDate = document.getElementById('startDate')?.value;
        if (!startDate) {
            alert('Please select a start date');
            return;
        }
        
        const duration = document.getElementById('duration')?.value;
        const message = document.getElementById('hireMessage')?.value;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/hire-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    helper_id: helperId,
                    profile_id: profileId,
                    start_date: startDate,
                    duration: duration || 'To be discussed',
                    message: message || ''
                })
            });
            
            const data = await response.json();
            if (data.success) {
                alert('Hire request sent!');
                modal.remove();
            } else {
                alert(data.error || 'Failed to send hire request');
            }
        } catch (error) {
            console.error('Hire request error:', error);
            alert('Network error');
        }
    };
}

// ========== BOOKMARK/SAVE ==========
async function toggleSave(profileId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/profiles/${profileId}/save`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            if (data.saved) {
                savedProfileIds.add(profileId);
                showNotification('✓ Profile saved!', 'success');
            } else {
                savedProfileIds.delete(profileId);
                showNotification('Profile removed from saved', 'info');
            }
            displayProfiles(allProfiles);
        }
    } catch (error) {
        console.error('Save error:', error);
        showNotification('Error saving profile', 'error');
    }
}

// ========== UTILITY FUNCTIONS ==========
function updateResultsCount(count) {
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        resultsCount.textContent = `Found ${count} professional${count !== 1 ? 's' : ''}`;
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    const performSearch = () => {
        const term = searchInput?.value.toLowerCase().trim();
        if (!term) {
            displayProfiles(allProfiles);
            updateResultsCount(allProfiles.length);
            return;
        }
        const filtered = allProfiles.filter(profile => 
            profile.name?.toLowerCase().includes(term) ||
            profile.role?.toLowerCase().includes(term) ||
            profile.bio?.toLowerCase().includes(term) ||
            profile.location?.toLowerCase().includes(term)
        );
        displayProfiles(filtered);
        updateResultsCount(filtered.length);
    };
    
    if (searchBtn) searchBtn.addEventListener('click', performSearch);
    if (searchInput) searchInput.addEventListener('input', performSearch);
}

function setupFilterChips() {
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', function() {
            filterChips.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            filterByType(this.dataset.filter);
        });
    });
}

function filterByType(filter) {
    let filtered = [...allProfiles];
    switch(filter) {
        case 'top-rated':
            filtered = allProfiles.filter(p => (parseFloat(p.rating) || 0) >= 4.5);
            break;
        case 'verified':
            filtered = allProfiles.filter(p => p.documents && p.documents.length > 0);
            break;
        case 'video':
            filtered = allProfiles.filter(p => p.video);
            break;
        default:
            filtered = allProfiles;
    }
    displayProfiles(filtered);
    updateResultsCount(filtered.length);
}

function showLoading() {
    const grid = document.getElementById('profilesGrid');
    if (grid) {
        grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading caregivers...</p></div>';
    }
}

function showNoProfiles() {
    const grid = document.getElementById('profilesGrid');
    if (grid) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">👵</div><div class="empty-title">No caregivers found</div><div class="empty-message">Be the first to create a profile!</div></div>';
    }
}

function showError(message) {
    const grid = document.getElementById('profilesGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="error-state">
                <div class="empty-icon">⚠️</div>
                <div class="empty-title">Error Loading Profiles</div>
                <div class="empty-message">${escapeHtml(message)}</div>
                <button class="btn-primary" onclick="location.reload()">Try Again</button>
            </div>
        `;
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function contactHelper(userId, name) {
    alert(`Contact ${name} - please log in as a hirer to message helpers.`);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Expose functions globally
window.viewProfileDetails = viewProfileDetails;
window.openMessageModal = openMessageModal;
window.openHireModal = openHireModal;
window.toggleSave = toggleSave;
window.contactHelper = contactHelper;
window.filterByType = filterByType;