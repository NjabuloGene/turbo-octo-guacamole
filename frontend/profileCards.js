// ==================== COMPLETE SERVICES.JS ====================
console.log('🚀 Services JS loaded');

const API_BASE_URL = 'http://localhost:3000';
let allProfiles = [];
let currentService = '';
let currentUser = null;
let conversations = [];

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM Content Loaded');
    
    // Get service type from body data attribute
    currentService = document.body.dataset.service || 'nurses';
    document.getElementById('pageTitle').textContent = getServiceTitle(currentService);
    
    console.log(`Loading ${currentService} profiles...`);
    
    // Check if user is logged in
    checkAuthStatus();
    
    const grid = document.getElementById('profilesGrid');
    if (!grid) {
        console.error('❌ Could not find profilesGrid element!');
        return;
    }
    
    // Show loading
    showLoading();
    
    // Load profiles
    loadProfiles();
    
    // Setup all event listeners
    setupEventListeners();
});

// ==================== AUTHENTICATION ====================
function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentUser = JSON.parse(user);
        updateAuthUI(true);
        loadConversations();
    } else {
        updateAuthUI(false);
    }
}

function updateAuthUI(isLoggedIn) {
    const authButtons = document.getElementById('authButtons');
    if (!authButtons) return;
    
    if (isLoggedIn && currentUser) {
        authButtons.innerHTML = `
            <div class="user-menu">
                <span class="user-name">👤 ${currentUser.name}</span>
                <button class="btn btn-outline" onclick="showMessages()">💬 Messages</button>
                <button class="btn btn-outline" onclick="logout()">Logout</button>
            </div>
        `;
    } else {
        authButtons.innerHTML = `
            <a href="login.html" class="btn btn-outline">Login</a>
            <a href="register.html" class="btn btn-primary">Sign Up</a>
        `;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    updateAuthUI(false);
    showNotification('Logged out successfully');
}

// ==================== PROFILE LOADING ====================
async function loadProfiles() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/profiles?service=${currentService}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📊 Raw profile data:', data);
        
        if (data.success && data.profiles.length > 0) {
            allProfiles = data.profiles;
            displayProfiles(allProfiles);
            updateResultCount(allProfiles.length);
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
    
    let html = '<div class="profiles-grid">';
    profiles.forEach(profile => {
        html += createProfileCard(profile);
    });
    html += '</div>';
    
    grid.innerHTML = html;
}

function createProfileCard(profile) {
    // Safely handle rating
    let rating = 4.5;
    if (profile.rating) {
        rating = parseFloat(profile.rating) || 4.5;
    }
    rating = Math.min(5, Math.max(0, rating));
    
    // Calculate stars
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const stars = '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalf ? 1 : 0));
    
    // Safely handle other fields
    const experience = profile.experience || '0 months';
    const location = profile.location || 'South Africa';
    const shortLocation = location.split(',')[0].trim();
    const rate = profile.rate || 'R200/hour';
    
    // Get initials for avatar
    const nameParts = profile.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Default image if none provided
    const imageUrl = profile.profile_pic || `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=2563eb&color=fff&size=200&bold=true&length=2`;
    
    return `
        <div class="profile-card" onclick="viewProfile(${profile.id})">
            <div class="card-header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);"></div>
            
            <div class="card-content">
                <img src="${imageUrl}" 
                     alt="${profile.name}" 
                     class="card-avatar"
                     onerror="this.src='https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=2563eb&color=fff&size=200&bold=true&length=2'">
                
                <h3 class="card-name">${profile.name}</h3>
                <p class="card-role">${profile.role || getServiceTitle(currentService)}</p>
                
                <div class="card-stats">
                    <span class="stat-item">
                        <span class="stat-icon">⭐</span>
                        <span>${rating.toFixed(1)}</span>
                    </span>
                    <span class="stat-item">
                        <span class="stat-icon">📅</span>
                        <span>${experience}</span>
                    </span>
                    <span class="stat-item">
                        <span class="stat-icon">📍</span>
                        <span>${shortLocation}</span>
                    </span>
                </div>
                
                <div class="card-badges">
                    ${profile.video ? '<span class="badge video">🎥 Video</span>' : ''}
                    ${profile.documents && profile.documents.length > 0 ? '<span class="badge verified">📄 Verified</span>' : ''}
                    ${rating >= 4.5 ? '<span class="badge top-rated">⭐ Top Rated</span>' : ''}
                </div>
                
                <div class="card-footer">
                    <button class="btn btn-primary" onclick="event.stopPropagation(); viewProfile(${profile.id})">
                        View Profile
                    </button>
                    <button class="btn btn-outline" onclick="event.stopPropagation(); startConversation(${profile.user_id}, '${profile.name}')">
                        💬 Message
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ==================== MESSAGING SYSTEM ====================
async function startConversation(userId, userName) {
    if (!currentUser) {
        showNotification('Please login to send messages', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    
    // Check if conversation already exists
    let existingConv = conversations.find(c => 
        c.participants.includes(userId) && c.participants.includes(currentUser.id)
    );
    
    if (existingConv) {
        openConversation(existingConv.id);
    } else {
        // Create new conversation
        const newConv = {
            id: Date.now(),
            participants: [currentUser.id, userId],
            participantNames: {
                [currentUser.id]: currentUser.name,
                [userId]: userName
            },
            messages: []
        };
        
        conversations.push(newConv);
        openConversation(newConv.id);
    }
}

function openConversation(convId) {
    const conversation = conversations.find(c => c.id === convId);
    if (!conversation) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    const otherUserId = conversation.participants.find(id => id !== currentUser.id);
    const otherUserName = conversation.participantNames[otherUserId];
    
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 500px;">
            <div class="modal-header">
                <h2>💬 Chat with ${otherUserName}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            
            <div class="modal-body">
                <div class="messages-container" id="messages-${convId}" style="
                    height: 400px;
                    overflow-y: auto;
                    padding: 1rem;
                    background: #f9fafb;
                    border-radius: 12px;
                    margin-bottom: 1rem;
                ">
                    ${renderMessages(conversation.messages)}
                </div>
                
                <div class="message-input-container" style="display: flex; gap: 0.5rem;">
                    <input type="text" 
                           id="message-${convId}" 
                           class="search-input" 
                           placeholder="Type your message..."
                           style="flex: 1;">
                    <button class="btn btn-primary" onclick="sendMessage(${convId})">
                        Send
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Auto-focus input
    setTimeout(() => {
        document.getElementById(`message-${convId}`)?.focus();
    }, 100);
}

function renderMessages(messages) {
    if (!messages || messages.length === 0) {
        return '<p style="text-align: center; color: #9ca3af; padding: 2rem;">No messages yet. Start the conversation!</p>';
    }
    
    return messages.map(msg => {
        const isMe = msg.senderId === currentUser.id;
        return `
            <div style="
                display: flex;
                justify-content: ${isMe ? 'flex-end' : 'flex-start'};
                margin-bottom: 1rem;
            ">
                <div style="
                    max-width: 70%;
                    background: ${isMe ? '#2563eb' : 'white'};
                    color: ${isMe ? 'white' : '#1f2937'};
                    padding: 0.75rem 1rem;
                    border-radius: 16px;
                    ${isMe ? 'border-bottom-right-radius: 4px;' : 'border-bottom-left-radius: 4px;'}
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                ">
                    <p style="margin-bottom: 0.25rem;">${msg.text}</p>
                    <small style="
                        opacity: 0.7;
                        font-size: 0.7rem;
                        display: block;
                        text-align: ${isMe ? 'right' : 'left'};
                    ">${new Date(msg.timestamp).toLocaleTimeString()}</small>
                </div>
            </div>
        `;
    }).join('');
}

function sendMessage(convId) {
    const input = document.getElementById(`message-${convId}`);
    const text = input.value.trim();
    
    if (!text) return;
    
    const conversation = conversations.find(c => c.id === convId);
    if (!conversation) return;
    
    // Add message
    const message = {
        id: Date.now(),
        senderId: currentUser.id,
        text: text,
        timestamp: new Date().toISOString()
    };
    
    if (!conversation.messages) {
        conversation.messages = [];
    }
    conversation.messages.push(message);
    
    // Clear input
    input.value = '';
    
    // Refresh messages
    const messagesContainer = document.getElementById(`messages-${convId}`);
    if (messagesContainer) {
        messagesContainer.innerHTML = renderMessages(conversation.messages);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // In a real app, you'd send this to the backend
    console.log('Message sent:', message);
}

function showMessages() {
    if (!currentUser || conversations.length === 0) {
        showNotification('No conversations yet', 'info');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 400px;">
            <div class="modal-header">
                <h2>💬 Your Messages</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            
            <div class="modal-body">
                <div class="conversations-list">
                    ${conversations.map(conv => {
                        const otherId = conv.participants.find(id => id !== currentUser.id);
                        const otherName = conv.participantNames[otherId];
                        const lastMsg = conv.messages?.[conv.messages.length - 1];
                        
                        return `
                            <div class="conversation-item" onclick="openConversation(${conv.id}); this.closest('.modal-overlay').remove();" style="
                                display: flex;
                                align-items: center;
                                gap: 1rem;
                                padding: 1rem;
                                border-bottom: 1px solid #e5e7eb;
                                cursor: pointer;
                                transition: background 0.2s;
                            ">
                                <div style="
                                    width: 50px;
                                    height: 50px;
                                    border-radius: 50%;
                                    background: #3b82f6;
                                    color: white;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-weight: bold;
                                ">${otherName.charAt(0)}</div>
                                <div style="flex: 1;">
                                    <h4 style="font-weight: 600;">${otherName}</h4>
                                    <p style="color: #6b7280; font-size: 0.875rem;">
                                        ${lastMsg ? lastMsg.text.substring(0, 30) + '...' : 'No messages yet'}
                                    </p>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ==================== PROFILE VIEWING ====================
async function viewProfile(profileId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/profiles/${profileId}`);
        const data = await response.json();
        
        if (data.success) {
            showProfileModal(data.profile);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Could not load profile details', 'error');
    }
}

function showProfileModal(profile) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    // Safely handle rating
    let rating = 4.5;
    if (profile.rating) {
        rating = parseFloat(profile.rating) || 4.5;
    }
    rating = Math.min(5, Math.max(0, rating));
    const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    
    // Create documents HTML
    const documentsHtml = profile.documents && profile.documents.length > 0 ? 
        profile.documents.map(doc => {
            const docName = doc.split('/').pop() || 'Document';
            return `
                <a href="${doc}" target="_blank" class="document-item">
                    <span class="document-icon">📄</span>
                    <span>${docName}</span>
                </a>
            `;
        }).join('') : '<p class="no-items">No documents uploaded</p>';
    
    // Create photos HTML
    const photosHtml = profile.photos && profile.photos.length > 0 ?
        profile.photos.map(photo => `
            <img src="${photo}" class="gallery-image" onclick="window.open('${photo}')" alt="Experience photo">
        `).join('') : '<p class="no-items">No photos uploaded</p>';
    
    // Get avatar URL
    const nameParts = profile.name.split(' ');
    const avatarUrl = profile.profile_pic || `https://ui-avatars.com/api/?name=${nameParts[0]}+${nameParts.slice(1).join(' ')}&background=2563eb&color=fff&size=200`;
    
    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2>Professional Profile</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            
            <div class="modal-body">
                <div class="profile-header">
                    <img src="${avatarUrl}" 
                         alt="${profile.name}" 
                         class="profile-avatar">
                    <div class="profile-title">
                        <h1>${profile.name}</h1>
                        <p class="profile-role">${profile.role || getServiceTitle(currentService)}</p>
                        <div class="profile-rating">${stars}</div>
                    </div>
                </div>
                
                <div class="profile-meta">
                    <div class="meta-item">
                        <span class="meta-label">💰 Rate</span>
                        <span class="meta-value">${profile.rate || 'R200/hour'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">📅 Experience</span>
                        <span class="meta-value">${profile.experience || '0 months'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">📍 Location</span>
                        <span class="meta-value">${profile.location || 'South Africa'}</span>
                    </div>
                </div>
                
                <div class="profile-section">
                    <h3>About</h3>
                    <p>${profile.bio || 'No bio provided.'}</p>
                </div>
                
                ${profile.photos && profile.photos.length > 0 ? `
                <div class="profile-section">
                    <h3>Experience Photos</h3>
                    <div class="photo-gallery">
                        ${photosHtml}
                    </div>
                </div>
                ` : ''}
                
                ${profile.documents && profile.documents.length > 0 ? `
                <div class="profile-section">
                    <h3>Documents & Certificates</h3>
                    <div class="documents-list">
                        ${documentsHtml}
                    </div>
                </div>
                ` : ''}
                
                ${profile.video ? `
                <div class="profile-section">
                    <h3>Introduction Video</h3>
                    <video src="${profile.video}" controls style="width: 100%; border-radius: 12px;"></video>
                </div>
                ` : ''}
                
                <div class="modal-actions">
                    ${currentUser ? `
                        <button class="btn btn-primary" onclick="startConversation(${profile.user_id}, '${profile.name}'); this.closest('.modal-overlay').remove();">
                            💬 Message ${profile.name.split(' ')[0]}
                        </button>
                    ` : `
                        <a href="login.html" class="btn btn-primary">
                            Login to Contact
                        </a>
                    `}
                    <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ==================== UTILITY FUNCTIONS ====================
function getServiceTitle(service) {
    const titles = {
        'nurses': 'Elderly Care Nurse',
        'nannies': 'Professional Nanny',
        'cleaners': 'Home Cleaner',
        'tutors': 'Private Tutor',
        'plumbers': 'Professional Plumber'
    };
    return titles[service] || 'Professional';
}

function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function(e) {
            const term = e.target.value.toLowerCase();
            
            if (!term || term.length < 2) {
                displayProfiles(allProfiles);
                updateResultCount(allProfiles.length);
                return;
            }
            
            const filtered = allProfiles.filter(profile => 
                profile.name.toLowerCase().includes(term) ||
                (profile.role && profile.role.toLowerCase().includes(term)) ||
                (profile.location && profile.location.toLowerCase().includes(term)) ||
                (profile.bio && profile.bio.toLowerCase().includes(term))
            );
            
            displayProfiles(filtered);
            updateResultCount(filtered.length);
        }, 300));
    }
    
    // Filter buttons
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            filterProfiles(this.dataset.filter);
        });
    });
}

function filterProfiles(filter) {
    let filtered = allProfiles;
    
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
    updateResultCount(filtered.length);
}

function updateResultCount(count) {
    const countEl = document.getElementById('resultCount');
    if (countEl) {
        countEl.textContent = count === 0 ? 'No results found' : 
                             count === 1 ? '1 professional found' : 
                             `${count} professionals found`;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading() {
    const grid = document.getElementById('profilesGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading professionals...</p>
        </div>
    `;
}

function showNoProfiles() {
    const grid = document.getElementById('profilesGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="empty-state">
            <h3>No professionals available yet</h3>
            <p>Be the first to offer your services!</p>
            <a href="profile-creation.html" class="btn btn-primary">Create Profile</a>
        </div>
    `;
    updateResultCount(0);
}

function showError(message) {
    const grid = document.getElementById('profilesGrid');
    if (!grid) return;
    
    grid.innerHTML = `
        <div class="error-state">
            <h3>⚠️ Error</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
        </div>
    `;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Make functions global
window.viewProfile = viewProfile;
window.startConversation = startConversation;
window.openConversation = openConversation;
window.sendMessage = sendMessage;
window.showMessages = showMessages;
window.logout = logout;