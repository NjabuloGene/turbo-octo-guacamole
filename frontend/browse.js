/**
 * Browse page for hirers to find helpers
 * Features: Search, Filter, Bookmark, Message, Hire
 */

document.addEventListener('DOMContentLoaded', () => {
    // ========== ELEMENT REFERENCES ==========
    const profilesGrid = document.getElementById('profilesGrid');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const serviceFilter = document.getElementById('serviceFilter');
    const locationFilter = document.getElementById('locationFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const sortFilter = document.getElementById('sortFilter');
    const resultsCount = document.getElementById('resultsCount');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const activeFilters = document.getElementById('activeFilters');
    
    // ========== STATE ==========
    let allProfiles = [];
    let savedProfileIds = new Set();
    let currentFilters = {
        search: '',
        service: '',
        location: '',
        minRating: '',
        sort: 'rating'
    };
    
    // ========== AUTH CHECK ==========
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Redirect helpers away (only hirers can browse)
    if (user.user_role === 'helper') {
        alert('This page is for hirers only. Redirecting to your profile.');
        window.location.href = 'profile.html';
        return;
    }
    
    // ========== LOAD SAVED PROFILES ==========
    async function loadSavedProfiles() {
        try {
            const response = await fetch('http://localhost:3000/api/saved-profiles', {
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
    
    // ========== LOAD PROFILES ==========
    async function loadProfiles() {
        if (!profilesGrid) return;
        
        // Show loading state
        profilesGrid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading professionals...</p></div>';
        
        try {
            const response = await fetch('http://localhost:3000/api/profiles/browse', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                if (response.status === 401) throw new Error('Session expired');
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                allProfiles = data.profiles || [];
                await loadSavedProfiles();
                applyFilters(); // Apply any current filters
            } else {
                profilesGrid.innerHTML = `<div class="error-message">❌ ${data.error || 'Failed to load profiles'}</div>`;
            }
        } catch (error) {
            console.error('Load profiles error:', error);
            if (error.message.includes('Session expired')) {
                profilesGrid.innerHTML = '<div class="error-message">Session expired. Redirecting to login...</div>';
                setTimeout(() => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = 'login.html';
                }, 2000);
            } else {
                profilesGrid.innerHTML = '<div class="error-message">❌ Network error - please check your connection</div>';
            }
        }
    }
    
    // ========== APPLY FILTERS ==========
    function applyFilters() {
        let filtered = [...allProfiles];
        
        // Search filter
        if (currentFilters.search) {
            const term = currentFilters.search.toLowerCase();
            filtered = filtered.filter(p => 
                p.name?.toLowerCase().includes(term) ||
                p.role?.toLowerCase().includes(term) ||
                p.bio?.toLowerCase().includes(term) ||
                p.location?.toLowerCase().includes(term)
            );
        }
        
        // Service filter
        if (currentFilters.service) {
            filtered = filtered.filter(p => p.service_type === currentFilters.service);
        }
        
        // Location filter
        if (currentFilters.location) {
            filtered = filtered.filter(p => 
                p.location?.toLowerCase().includes(currentFilters.location.toLowerCase())
            );
        }
        
        // Rating filter
        if (currentFilters.minRating) {
            const minRating = parseFloat(currentFilters.minRating);
            filtered = filtered.filter(p => (parseFloat(p.rating) || 0) >= minRating);
        }
        
        // Sort
        switch(currentFilters.sort) {
            case 'rating':
                filtered.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
                break;
            case 'newest':
                filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                break;
            case 'experience':
                filtered.sort((a, b) => (parseInt(b.experience) || 0) - (parseInt(a.experience) || 0));
                break;
        }
        
        displayProfiles(filtered);
        updateResultsCount(filtered.length);
        updateActiveFilters();
    }
    
    // ========== DISPLAY PROFILES ==========
    function displayProfiles(profiles) {
        if (!profilesGrid) return;
        
        if (!profiles || profiles.length === 0) {
            profilesGrid.innerHTML = '<div class="no-results"><h3>No professionals found</h3><p>Try adjusting your filters</p></div>';
            return;
        }
        
        let html = '<div class="cards-grid">';
        profiles.forEach(profile => {
            html += createProfileCard(profile);
        });
        html += '</div>';
        
        profilesGrid.innerHTML = html;
    }
    
    // ========== CREATE PROFILE CARD ==========
    function createProfileCard(profile) {
        // Safely handle rating
        let rating = 4.0;
        if (profile.rating) {
            rating = parseFloat(profile.rating) || 4.0;
        }
        rating = Math.min(5, Math.max(0, rating));
        
        const stars = '★'.repeat(Math.floor(rating)) + 
                      (rating % 1 >= 0.5 ? '½' : '') + 
                      '☆'.repeat(5 - Math.floor(rating) - (rating % 1 >= 0.5 ? 1 : 0));
        
        const profileImage = profile.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff&size=200`;
        const isSaved = savedProfileIds.has(profile.id);
        const escapedName = profile.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        return `
            <div class="helper-card" data-profile-id="${profile.id}" data-user-id="${profile.user_id}" onclick="viewProfileDetails(${profile.id})">
                <div class="helper-card-header">
                    <div class="helper-avatar">
                        <img src="${profileImage}" alt="${profile.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff'">
                    </div>
                    <div class="helper-info">
                        <div class="name">${escapeHtml(profile.name)}</div>
                        <div class="role">${profile.role || 'Professional'}</div>
                        <div class="rate">${profile.rate || 'R200/hour'}</div>
                    </div>
                </div>
                
                <div class="helper-card-bio">
                    ${profile.bio ? escapeHtml(profile.bio.substring(0, 100)) : 'No bio provided'}${profile.bio?.length > 100 ? '...' : ''}
                </div>
                
                <div class="helper-card-meta">
                    <span>📍 ${profile.location || 'Location not set'}</span>
                    <span>📅 ${profile.experience || '0 months'}</span>
                    <span>⭐ ${rating.toFixed(1)}</span>
                </div>
                
                <div class="helper-card-actions">
                    <button class="contact-btn" data-user-id="${profile.user_id}" data-profile-id="${profile.id}" data-name="${escapedName}">
                        💬 Message
                    </button>
                    <button class="hire-btn btn-primary" data-user-id="${profile.user_id}" data-profile-id="${profile.id}" data-name="${escapedName}">
                        🤝 Hire
                    </button>
                    <button class="save-btn ${isSaved ? 'saved' : ''}" data-profile-id="${profile.id}">
                        ${isSaved ? '★ Saved' : '☆ Bookmark'}
                    </button>
                </div>
            </div>
        `;
    }
    
    // ========== ATTACH BUTTON EVENTS ==========
    function attachButtonEvents() {
        // Bookmark buttons
        document.querySelectorAll('.save-btn').forEach(btn => {
            btn.removeEventListener('click', handleSaveClick);
            btn.addEventListener('click', handleSaveClick);
        });
        
        // Message buttons
        document.querySelectorAll('.contact-btn').forEach(btn => {
            btn.removeEventListener('click', handleMessageClick);
            btn.addEventListener('click', handleMessageClick);
        });
        
        // Hire buttons
        document.querySelectorAll('.hire-btn').forEach(btn => {
            btn.removeEventListener('click', handleHireClick);
            btn.addEventListener('click', handleHireClick);
        });
    }
    
    // ========== BOOKMARK HANDLER ==========
    async function handleSaveClick(event) {
        event.stopPropagation();
        const btn = event.currentTarget;
        const profileId = btn.dataset.profileId;
        
        try {
            const response = await fetch(`http://localhost:3000/api/profiles/${profileId}/save`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                if (data.saved) {
                    savedProfileIds.add(parseInt(profileId));
                    btn.innerHTML = '★ Saved';
                    btn.classList.add('saved');
                    showNotification('✓ Profile bookmarked!', 'success');
                } else {
                    savedProfileIds.delete(parseInt(profileId));
                    btn.innerHTML = '☆ Bookmark';
                    btn.classList.remove('saved');
                    showNotification('Profile removed from bookmarks', 'info');
                }
            }
        } catch (error) {
            console.error('Bookmark error:', error);
            showNotification('Error saving bookmark', 'error');
        }
    }
    
    // ========== MESSAGE HANDLER ==========
    function handleMessageClick(event) {
        event.stopPropagation();
        const btn = event.currentTarget;
        const userId = btn.dataset.userId;
        const profileId = btn.dataset.profileId;
        const name = btn.dataset.name;
        
        openMessageModal(userId, profileId, name);
    }
    
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
                <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="btn-primary" id="sendMessageConfirmBtn">Send Message</button>
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('sendMessageConfirmBtn').onclick = () => {
            sendMessageSubmit(receiverId, profileId);
        };
    }
    
    async function sendMessageSubmit(receiverId, profileId) {
        const messageText = document.getElementById('messageText')?.value;
        if (!messageText) {
            showNotification('Please enter a message', 'error');
            return;
        }
        
        try {
            const response = await fetch('http://localhost:3000/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiver_id: parseInt(receiverId),
                    profile_id: profileId ? parseInt(profileId) : null,
                    message: messageText
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Message sent!', 'success');
                document.querySelector('.modal-overlay')?.remove();
            } else {
                showNotification(data.error || 'Failed to send message', 'error');
            }
        } catch (error) {
            console.error('Send message error:', error);
            showNotification('Network error', 'error');
        }
    }
    
    // ========== HIRE HANDLER ==========
    function handleHireClick(event) {
        event.stopPropagation();
        const btn = event.currentTarget;
        const userId = btn.dataset.userId;
        const profileId = btn.dataset.profileId;
        const name = btn.dataset.name;
        
        openHireModal(userId, profileId, name);
    }
    
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
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label>Start Date *</label>
                        <input type="date" id="startDate" value="${defaultDate}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border);">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label>Duration / Hours</label>
                        <input type="text" id="duration" placeholder="e.g., 4 hours, 1 week, ongoing" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border);">
                    </div>
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label>Message (optional)</label>
                        <textarea id="hireMessage" rows="3" placeholder="Tell ${helperName} about your needs..." style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); resize:vertical;"></textarea>
                    </div>
                </div>
                <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="btn-primary" id="submitHireBtn">Send Hire Request</button>
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('submitHireBtn').onclick = () => {
            submitHireRequest(helperId, profileId);
        };
    }
    
    async function submitHireRequest(helperId, profileId) {
        const startDate = document.getElementById('startDate')?.value;
        const duration = document.getElementById('duration')?.value;
        const message = document.getElementById('hireMessage')?.value;
        
        if (!startDate) {
            showNotification('Please select a start date', 'error');
            return;
        }
        
        try {
            const response = await fetch('http://localhost:3000/api/hire-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    helper_id: parseInt(helperId),
                    profile_id: profileId ? parseInt(profileId) : null,
                    start_date: startDate,
                    duration: duration || 'To be discussed',
                    message: message || ''
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Hire request sent! The helper will contact you soon.', 'success');
                document.querySelector('.modal-overlay')?.remove();
            } else {
                showNotification(data.error || 'Failed to send hire request', 'error');
            }
        } catch (error) {
            console.error('Hire request error:', error);
            showNotification('Network error', 'error');
        }
    }
    
    // ========== SHOW PROFILE MODAL (Clean, intuitive design) ==========
    function showProfileModal(profile) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        
        // Safely handle rating
        let rating = profile.rating || 4.0;
        rating = parseFloat(rating);
        const fullStars = Math.floor(rating);
        const hasHalf = rating % 1 >= 0.5;
        const stars = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0));
        
        const profileImage = profile.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=00938a&color=fff&size=200`;
        
        // Create photos gallery HTML
        let photosHtml = '';
        if (profile.photos && profile.photos.length > 0) {
            photosHtml = `
                <div class="profile-gallery">
                    <h3>Experience Photos</h3>
                    <div class="gallery-grid">
                        ${profile.photos.map(photo => `
                            <img src="${photo}" class="gallery-image" onclick="window.open('${photo}', '_blank')" alt="Experience photo">
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Create documents HTML
        let documentsHtml = '';
        if (profile.documents && profile.documents.length > 0) {
            documentsHtml = `
                <div class="profile-gallery">
                    <h3>Documents & Certificates</h3>
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
        
        // Video HTML
        let videoHtml = '';
        if (profile.video) {
            videoHtml = `
                <div class="profile-gallery">
                    <h3>Introduction Video</h3>
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
                                <div class="meta-item">
                                    <span class="icon">📍</span>
                                    <span>${profile.location || 'Location not set'}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="icon">💰</span>
                                    <span>${profile.rate || 'R200/hour'}</span>
                                </div>
                                <div class="meta-item">
                                    <span class="icon">📅</span>
                                    <span>${profile.experience || '0 months'} experience</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-detail-bio">
                        <h3>About</h3>
                        <p>${profile.bio || 'No bio provided.'}</p>
                    </div>
                    
                    ${photosHtml}
                    ${documentsHtml}
                    ${videoHtml}
                </div>
                <div class="modal-actions">
                    <button class="action-btn btn-message" onclick="openMessageModalFromProfile(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                        💬 Message
                    </button>
                    <button class="action-btn btn-hire" onclick="openHireModalFromProfile(${profile.user_id}, ${profile.id}, '${escapeHtml(profile.name)}')">
                        🤝 Hire
                    </button>
                    <button class="action-btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // ========== HELPER FUNCTIONS FOR MODAL BUTTONS ==========
    window.openMessageModalFromProfile = function(userId, profileId, name) {
        document.querySelector('.modal-overlay')?.remove();
        if (typeof openMessageModal === 'function') {
            openMessageModal(userId, profileId, name);
        }
    };
    
    window.openHireModalFromProfile = function(userId, profileId, name) {
        document.querySelector('.modal-overlay')?.remove();
        if (typeof openHireModal === 'function') {
            openHireModal(userId, profileId, name);
        }
    };
    
    // ========== VIEW PROFILE DETAILS (calls showProfileModal) ==========
    window.viewProfileDetails = async function(profileId) {
        try {
            const response = await fetch(`http://localhost:3000/api/profiles/${profileId}/details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                showProfileModal(data.profile);
            } else {
                showNotification('Could not load profile details', 'error');
            }
        } catch (error) {
            console.error('View profile error:', error);
            showNotification('Error loading profile', 'error');
        }
    };
    
    // ========== EXPOSE FUNCTIONS GLOBALLY ==========
    window.openMessageModal = openMessageModal;
    window.openHireModal = openHireModal;
    window.toggleSave = handleSaveClick;
    
    // ========== UI HELPERS ==========
    function updateResultsCount(count) {
        if (resultsCount) {
            resultsCount.textContent = `Found ${count} professional${count !== 1 ? 's' : ''}`;
        }
        if (clearFiltersBtn) {
            clearFiltersBtn.style.display = Object.values(currentFilters).some(v => v) ? 'inline-block' : 'none';
        }
    }
    
    function updateActiveFilters() {
        if (!activeFilters) return;
        
        const activeList = [];
        if (currentFilters.search) activeList.push(`Search: "${currentFilters.search}"`);
        if (currentFilters.service) {
            const serviceNames = { nannies: 'Nannies', cleaners: 'Cleaners', nurses: 'Nurses' };
            activeList.push(`Service: ${serviceNames[currentFilters.service]}`);
        }
        if (currentFilters.location) activeList.push(`Location: ${currentFilters.location}`);
        if (currentFilters.minRating) activeList.push(`${currentFilters.minRating}+ Stars`);
        
        if (activeList.length > 0) {
            activeFilters.innerHTML = `
                <span>Active filters:</span>
                ${activeList.map(filter => `<span class="filter-tag">${filter}</span>`).join('')}
            `;
        } else {
            activeFilters.innerHTML = '';
        }
    }
    
    function clearAllFilters() {
        currentFilters = { search: '', service: '', location: '', minRating: '', sort: 'rating' };
        if (searchInput) searchInput.value = '';
        if (serviceFilter) serviceFilter.value = '';
        if (locationFilter) locationFilter.value = '';
        if (ratingFilter) ratingFilter.value = '';
        if (sortFilter) sortFilter.value = 'rating';
        applyFilters();
    }
    
    function searchProfiles() {
        currentFilters.search = searchInput?.value.trim() || '';
        applyFilters();
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
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: 'DM Sans', sans-serif;
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
    
    // ========== EVENT LISTENERS ==========
    if (searchBtn) searchBtn.addEventListener('click', searchProfiles);
    if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchProfiles(); });
    if (serviceFilter) serviceFilter.addEventListener('change', () => { currentFilters.service = serviceFilter.value; applyFilters(); });
    if (locationFilter) locationFilter.addEventListener('change', () => { currentFilters.location = locationFilter.value; applyFilters(); });
    if (ratingFilter) ratingFilter.addEventListener('change', () => { currentFilters.minRating = ratingFilter.value; applyFilters(); });
    if (sortFilter) sortFilter.addEventListener('change', () => { currentFilters.sort = sortFilter.value; applyFilters(); });
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', clearAllFilters);
    
    // Attach button events after DOM updates
    const observer = new MutationObserver(() => {
        attachButtonEvents();
    });
    observer.observe(profilesGrid, { childList: true, subtree: true });
    
    // ========== INITIAL LOAD ==========
    loadProfiles();
});