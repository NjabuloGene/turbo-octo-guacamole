// ==================== MAIN.JS ====================
// This handles displaying profiles on the main page

const API_BASE_URL = 'http://localhost:3000';
let currentService = 'nannies';
let allProfiles = [];

document.addEventListener('DOMContentLoaded', function() {
    console.log('Main page loaded');
    
    // Load profiles
    loadProfiles();
    
    // Set up event listeners
    setupEventListeners();
    
    // Make functions global
    makeFunctionsGlobal();
});

async function loadProfiles() {
    try {
        console.log(`Loading profiles for service: ${currentService}`);
        const response = await fetch(`${API_BASE_URL}/api/profiles?service=${currentService}`);
        const data = await response.json();
        
        console.log('Profiles loaded:', data);
        
        if (data.success) {
            allProfiles = data.profiles;
            displayProfiles(allProfiles);
        } else {
            console.error('Failed to load profiles:', data.error);
            showNoProfiles();
        }
    } catch (error) {
        console.error('Error loading profiles:', error);
        showNoProfiles();
    }
}

function displayProfiles(profiles) {
    const container = document.getElementById('serviceCards');
    if (!container) {
        console.error('Service cards container not found');
        return;
    }
    
    container.innerHTML = '';
    
    if (profiles.length === 0) {
        showNoProfiles();
        return;
    }
    
    profiles.forEach(pro => {
        const card = createProfileCard(pro);
        container.appendChild(card);
    });
}

function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'container';
    
    // Handle profile picture
    let profileImage = profile.profile_pic || 
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='90' fill='%230c2624'/%3E%3Ccircle cx='100' cy='70' r='30' fill='%23e4ded6'/%3E%3C/svg%3E";
    
    // Format rating stars
    const rating = profile.rating || 0;
    const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    
    // Count documents
    const docCount = profile.documents ? profile.documents.length : 0;
    
    card.innerHTML = `
        <img src="${profileImage}" alt="${profile.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'200\' viewBox=\'0 0 200 200\'%3E%3Ccircle cx=\'100\' cy=\'100\' r=\'90\' fill=\'%230c2624\'/%3E%3Ccircle cx=\'100\' cy=\'70\' r=\'30\' fill=\'%23e4ded6\'/%3E%3C/svg%3E'">
        <div>
            <h4>${profile.name}</h4>
            <p>${stars}</p>
            <p>${profile.role || 'Professional'}</p>
            <p>${profile.experience || '0 months'} exp</p>
            <p>${profile.rate || 'R000/hour'}</p>
            <p>📍 ${profile.location || 'Location not set'}</p>
            ${profile.video ? '<p>🎥 Has video intro</p>' : ''}
            ${docCount > 0 ? `<p>📄 ${docCount} document(s)</p>` : ''}
            <button onclick="viewProfile(${profile.id})">View Profile</button>
            <button onclick="contactProfile(${profile.id})">Contact</button>
        </div>
    `;
    
    return card;
}

function showNoProfiles() {
    const container = document.getElementById('serviceCards');
    if (container) {
        container.innerHTML = '<div class="no-results">No professionals found in this category yet. Be the first to create a profile!</div>';
    }
}

function setupEventListeners() {
    // Service buttons
    document.querySelectorAll('.service-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const service = this.textContent.toLowerCase().includes('nanny') ? 'nannies' :
                           this.textContent.toLowerCase().includes('clean') ? 'cleaners' : 'nurses';
            switchService(service);
        });
    });
    
    // Search button
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            searchProfiles();
        });
    }
    
    // Search input (Enter key)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchProfiles();
            }
        });
    }
}

function switchService(service) {
    currentService = service;
    
    // Update active button
    document.querySelectorAll('.service-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(service === 'nannies' ? 'nanny' : 
                                                    service === 'cleaners' ? 'clean' : 'nurse')) {
            btn.classList.add('active');
        }
    });
    
    // Update title
    const titleMap = {
        'nannies': 'Nanny',
        'cleaners': 'Cleaner',
        'nurses': 'Nurse'
    };
    const titleElement = document.getElementById('currentServiceTitle');
    if (titleElement) {
        titleElement.textContent = titleMap[service];
    }
    
    // Reload profiles
    loadProfiles();
}

async function searchProfiles() {
    const searchTerm = document.getElementById('searchInput')?.value.trim();
    
    if (!searchTerm) {
        loadProfiles(); // Just reload normal profiles
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/profiles/search?q=${encodeURIComponent(searchTerm)}`);
        const data = await response.json();
        
        if (data.success) {
            displayProfiles(data.profiles);
        }
    } catch (error) {
        console.error('Search error:', error);
    }
}

function viewProfile(id) {
    window.location.href = `profile.html?id=${id}`;
}

function contactProfile(id) {
    // You'll implement this later
    alert('Contact feature coming soon!');
}

function makeFunctionsGlobal() {
    window.switchService = switchService;
    window.viewProfile = viewProfile;
    window.contactProfile = contactProfile;
    window.searchProfiles = searchProfiles;
}

function createProfileCard(profile) {
    // ... existing code ...
    
    // Better image handling with fallback
    let imageUrl = profile.profile_pic;
    
    // If no profile pic, generate avatar with initials
    if (!imageUrl) {
        const nameParts = profile.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        imageUrl = `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=2563eb&color=fff&size=200&bold=true&length=2`;
    }
    
    // Add image debugging (remove after fixing)
    console.log(`Profile ${profile.id} - ${profile.name}:`, imageUrl);
    
    return `
        <div class="profile-card" onclick="viewProfile(${profile.id})">
            <div class="card-header" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);"></div>
            
            <div class="card-content">
                <img src="${imageUrl}" 
                     alt="${profile.name}" 
                     class="card-avatar"
                     onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=2563eb&color=fff&size=200&bold=true&length=2'">
                
                <!-- rest of the card -->
            </div>
        </div>
    `;
}