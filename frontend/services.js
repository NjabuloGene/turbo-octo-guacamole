// services.js - Reusable for all service pages
const API_BASE_URL = 'http://localhost:3000';
let allProfiles = [];
let currentService = '';

document.addEventListener('DOMContentLoaded', function() {
    // Get service type from URL or data attribute
    currentService = document.body.dataset.service || 'nurses';
    console.log(`Loading ${currentService} profiles...`);
    
    loadProfiles();
    setupSearch();
});

async function loadProfiles() {
    // Same as elderlyCare.js but with dynamic service type
    try {
        const response = await fetch(`${API_BASE_URL}/api/profiles?service=${currentService}`);
        const data = await response.json();
        
        if (data.success && data.profiles.length > 0) {
            allProfiles = data.profiles;
            displayProfiles(allProfiles);
        } else {
            showNoProfiles();
        }
    } catch (error) {
        showError('Failed to load profiles');
    }
}
// ... rest of the functions (same as elderlyCare.js)