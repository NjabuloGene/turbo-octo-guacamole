// ==================== BACKEND INTEGRATION ====================
const API_BASE_URL = 'http://localhost:3000';

// ==================== DATA STORAGE ====================
let professionals = {
    nannies: [],
    cleaners: [],
    nurses: []
};

let currentService = 'nannies';

// ==================== PROFILE DATA ====================
let profileData = {
    name: 'Alex Rivera',
    role: 'Special Needs Nanny',
    rate: 'R280/hour',
    experience: '28 months',
    location: 'Centurion, Pretoria',
    service: 'nannies',
    rating: '★★★★☆',
    bio: 'First aid certified • Infant sleep trainer • 5 years volunteer experience',
    profilePic: null,
    profilePicFile: null,
    experiencePhotos: [],
    experiencePhotoFiles: [],
    documents: [],
    documentFiles: [],
    video: null,
    videoFile: null
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing app');
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('User not logged in');
        loadSampleData();
    } else {
        loadProfilesFromBackend();
    }
    
    // Set initial form values
    setInitialFormValues();
    
    // Set up all event listeners
    setupEventListeners();
    
    // Make all functions globally available
    makeFunctionsGlobal();
    
    // Initial display
    displayServiceCards(currentService);
    updateServiceDisplay();
    updatePreview();
});

// ==================== BACKEND API FUNCTIONS ====================

async function uploadFile(file, endpoint) {
    console.log('📤 uploadFile called with:', { file, endpoint });
    
    const token = localStorage.getItem('token');
    console.log('Token exists:', !!token);
    
    if (!token) {
        showNotification('Please log in first', 'error');
        return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    console.log('FormData created with file:', file.name);
    
    try {
        console.log(`Fetching: ${API_BASE_URL}${endpoint}`);
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);
        
        if (data.success) {
            console.log('✅ Upload successful, URL:', data.url);
            return data.url;
        } else {
            console.error('❌ Upload failed:', data.error);
            showNotification('Upload failed: ' + (data.error || 'Unknown error'), 'error');
            return null;
        }
    } catch (error) {
        console.error('❌ Upload error:', error);
        showNotification('Network error during upload', 'error');
        return null;
    }
}

async function loadProfilesFromBackend() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/profiles?service=${currentService}`);
        const data = await response.json();
        
        if (data.success) {
            professionals = {
                nannies: data.profiles.filter(p => p.service_type === 'nannies'),
                cleaners: data.profiles.filter(p => p.service_type === 'cleaners'),
                nurses: data.profiles.filter(p => p.service_type === 'nurses')
            };
            displayServiceCards(currentService);
        } else {
            loadSampleData();
        }
    } catch (error) {
        console.error('Error loading profiles:', error);
        loadSampleData();
    }
}

// ==================== PROFILE CREATION ====================
async function createProfile() {
    const token = localStorage.getItem('token');
    if (!token) {
        showNotification('Please log in to create a profile', 'error');
        window.location.href = 'login.html';
        return;
    }
    
    const name = document.getElementById('profileName')?.value;
    if (!name) {
        showNotification('Please enter your name', 'error');
        return;
    }
    
    const createBtn = document.querySelector('.btn-primary');
    const originalText = createBtn.textContent;
    createBtn.textContent = 'Creating profile...';
    createBtn.disabled = true;
    
    try {
        let profilePicUrl = profileData.profilePic;
        let photoUrls = [];
        let documentUrls = [];
        let videoUrl = profileData.video;
        
        // Upload profile picture
        if (profileData.profilePicFile) {
            console.log('📸 Uploading profile picture...');
            const url = await uploadFile(profileData.profilePicFile, '/api/upload/profile-pic');
            console.log('📸 Upload result:', url);
            if (url) {
                profilePicUrl = url;
                console.log('✅ Profile picture URL saved:', profilePicUrl);
            }
        }
        
        // Upload experience photos
        if (profileData.experiencePhotoFiles && profileData.experiencePhotoFiles.length > 0) {
            console.log('🖼️ Uploading', profileData.experiencePhotoFiles.length, 'photos...');
            for (const file of profileData.experiencePhotoFiles) {
                const url = await uploadFile(file, '/api/upload/photo');
                if (url) photoUrls.push(url);
            }
            console.log('✅ Photos uploaded:', photoUrls);
        }
        
        // Upload documents
        if (profileData.documentFiles && profileData.documentFiles.length > 0) {
            console.log('📄 Uploading', profileData.documentFiles.length, 'documents...');
            for (const file of profileData.documentFiles) {
                const url = await uploadFile(file, '/api/upload/document');
                if (url) documentUrls.push(url);
            }
            console.log('✅ Documents uploaded:', documentUrls);
        }
        
        // Upload video
        if (profileData.videoFile) {
            console.log('🎥 Uploading video...');
            const url = await uploadFile(profileData.videoFile, '/api/upload/video');
            if (url) videoUrl = url;
            console.log('✅ Video uploaded:', videoUrl);
        }
        
        const profilePayload = {
            name: name,
            role: document.getElementById('profileRole')?.value || 'Professional',
            rate: document.getElementById('profileRate')?.value || 'R200/hour',
            experience: document.getElementById('profileExp')?.value || '0 months',
            location: document.getElementById('profileLoc')?.value || 'Location not set',
            service_type: document.getElementById('profileService')?.value || 'nannies',
            bio: document.getElementById('profileBio')?.value || 'No bio yet',
            profile_pic: profilePicUrl,
            photos: photoUrls,
            documents: documentUrls,
            video: videoUrl
        };
        
        console.log('📦 Sending profile payload:', profilePayload);
        
        const response = await fetch(`${API_BASE_URL}/api/profiles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profilePayload)
        });
        
        const data = await response.json();
        console.log('📥 Profile creation response:', data);
        
        if (data.success) {
            showNotification('✅ Profile created successfully!', 'success');
            
            const newProfile = {
                ...profilePayload,
                rating: '★★★★☆',
                profilePic: profilePicUrl
            };
            
            const service = profilePayload.service_type;
            if (!professionals[service]) professionals[service] = [];
            professionals[service].push(newProfile);
            displayServiceCards(service);
            
            setTimeout(() => {
                if (confirm('Profile created! Would you like to clear the form?')) {
                    clearForm();
                }
            }, 1000);
        } else {
            showNotification('Failed to create profile: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('❌ Profile creation error:', error);
        showNotification('Network error - please try again', 'error');
    } finally {
        createBtn.textContent = originalText;
        createBtn.disabled = false;
    }
}

function setInitialFormValues() {
    const nameInput = document.getElementById('profileName');
    const roleInput = document.getElementById('profileRole');
    const rateInput = document.getElementById('profileRate');
    const expInput = document.getElementById('profileExp');
    const locInput = document.getElementById('profileLoc');
    const serviceSelect = document.getElementById('profileService');
    const bioInput = document.getElementById('profileBio');
    
    if (nameInput) nameInput.value = profileData.name;
    if (roleInput) roleInput.value = profileData.role;
    if (rateInput) rateInput.value = profileData.rate;
    if (expInput) expInput.value = profileData.experience;
    if (locInput) locInput.value = profileData.location;
    if (serviceSelect) serviceSelect.value = profileData.service;
    if (bioInput) bioInput.value = profileData.bio;
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // ===== FILE UPLOADS - USING NATIVE LABELS (NO CLICK HANDLERS NEEDED) =====
    // We ONLY need change handlers to process files after selection
    // The labels in HTML handle the clicking automatically
    
    // Profile pic upload - only change handler
    const profilePicInput = document.getElementById('profilePicInput');
    if (profilePicInput) {
        // Remove any existing listeners to prevent duplicates
        const newProfilePicInput = profilePicInput.cloneNode(true);
        profilePicInput.parentNode.replaceChild(newProfilePicInput, profilePicInput);
        
        newProfilePicInput.addEventListener('change', function(e) {
            console.log('📸 Profile pic selected', this.files);
            if (this.files && this.files[0]) {
                handleProfilePicUpload(this);
            }
            // Clear the input so the same file can be selected again if needed
            this.value = '';
        });
    } else {
        console.log('profilePicInput not found');
    }
    
    // Photo upload - only change handler
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
        const newPhotoInput = photoInput.cloneNode(true);
        photoInput.parentNode.replaceChild(newPhotoInput, photoInput);
        
        newPhotoInput.addEventListener('change', function(e) {
            console.log('🖼️ Photos selected', this.files);
            if (this.files && this.files.length > 0) {
                handlePhotoUpload(this);
            }
            this.value = '';
        });
    } else {
        console.log('photoInput not found');
    }
    
    // CV upload - only change handler
    const cvInput = document.getElementById('cvInput');
    if (cvInput) {
        const newCvInput = cvInput.cloneNode(true);
        cvInput.parentNode.replaceChild(newCvInput, cvInput);
        
        newCvInput.addEventListener('change', function(e) {
            console.log('📄 CV selected', this.files);
            if (this.files && this.files[0]) {
                handleCVUpload(this);
            }
            this.value = '';
        });
    } else {
        console.log('cvInput not found');
    }
    
    // Certificate upload - only change handler
    const certInput = document.getElementById('certInput');
    if (certInput) {
        const newCertInput = certInput.cloneNode(true);
        certInput.parentNode.replaceChild(newCertInput, certInput);
        
        newCertInput.addEventListener('change', function(e) {
            console.log('📜 Certificates selected', this.files);
            if (this.files && this.files.length > 0) {
                handleCertificateUpload(this);
            }
            this.value = '';
        });
    } else {
        console.log('certInput not found');
    }
    
    // Video upload - only change handler
    const videoInput = document.getElementById('videoInput');
    if (videoInput) {
        const newVideoInput = videoInput.cloneNode(true);
        videoInput.parentNode.replaceChild(newVideoInput, videoInput);
        
        newVideoInput.addEventListener('change', function(e) {
            console.log('🎥 Video selected', this.files);
            if (this.files && this.files[0]) {
                handleVideoUpload(this);
            }
            this.value = '';
        });
    } else {
        console.log('videoInput not found');
    }
    
    // ===== REAL-TIME INPUT LISTENERS =====
    const profileName = document.getElementById('profileName');
    if (profileName) {
        profileName.addEventListener('input', function(e) {
            profileData.name = e.target.value;
            updatePreview();
        });
    }
    
    const profileRole = document.getElementById('profileRole');
    if (profileRole) {
        profileRole.addEventListener('input', function(e) {
            profileData.role = e.target.value;
            updatePreview();
        });
    }
    
    const profileRate = document.getElementById('profileRate');
    if (profileRate) {
        profileRate.addEventListener('input', function(e) {
            profileData.rate = e.target.value;
            updatePreview();
        });
    }
    
    const profileExp = document.getElementById('profileExp');
    if (profileExp) {
        profileExp.addEventListener('input', function(e) {
            profileData.experience = e.target.value;
            updatePreview();
        });
    }
    
    const profileLoc = document.getElementById('profileLoc');
    if (profileLoc) {
        profileLoc.addEventListener('input', function(e) {
            profileData.location = e.target.value;
            updatePreview();
        });
    }
    
    const profileService = document.getElementById('profileService');
    if (profileService) {
        profileService.addEventListener('change', function(e) {
            profileData.service = e.target.value;
            updatePreview();
        });
    }
    
    const profileBio = document.getElementById('profileBio');
    if (profileBio) {
        profileBio.addEventListener('input', function(e) {
            profileData.bio = e.target.value;
            updatePreview();
        });
    }
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', function(e) {
            e.preventDefault();
            toggleDarkMode();
        });
    }
    
    // Search button
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            search();
        });
    }
    
    console.log('Event listeners setup complete');
}

function makeFunctionsGlobal() {
    window.switchService = switchService;
    window.switchTab = switchTab;
    window.switchPage = switchPage;
    window.setLocation = setLocation;
    window.reveal = reveal;
    window.search = search;
    window.createProfile = createProfile;
    window.clearForm = clearForm;
    window.removeVideo = removeVideo;
    window.browseService = browseService;
    window.enquire = enquire;
    window.hire = hire;
    window.viewProfile = viewProfile;
    window.removePhoto = removePhoto;
    window.removeDocument = removeDocument;
}

// ==================== SAMPLE DATA ====================
function loadSampleData() {
    professionals.nannies = [
        {
            name: 'Alex Rivera',
            role: 'Special Needs Nanny',
            rate: 'R280/hour',
            experience: '28 months',
            location: 'Centurion, Pretoria',
            rating: '★★★★★',
            bio: 'First aid certified • Infant sleep trainer',
            service: 'nannies'
        },
        {
            name: 'Sarah M.',
            role: 'Newborn Care Specialist',
            rate: 'R320/hour',
            experience: '36 months',
            location: 'Sandton, JHB',
            rating: '★★★★★',
            bio: 'Certified newborn care specialist',
            service: 'nannies'
        }
    ];
    
    professionals.cleaners = [
        {
            name: 'James K.',
            role: 'Deep Clean Expert',
            rate: 'R180/hour',
            experience: '24 months',
            location: 'Fourways, JHB',
            rating: '★★★★☆',
            bio: 'Eco-friendly cleaning specialist',
            service: 'cleaners'
        }
    ];
    
    professionals.nurses = [
        {
            name: 'Dr. Mary M.',
            role: 'Registered Nurse',
            rate: 'R450/hour',
            experience: '60 months',
            location: 'Midrand',
            rating: '★★★★★',
            bio: 'Critical care specialist',
            service: 'nurses'
        }
    ];
}

// ==================== SERVICE SWITCHING ====================
function switchService(service) {
    currentService = service;
    
    document.querySelectorAll('.service-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(service)) {
            btn.classList.add('active');
        }
    });
    
    updateServiceDisplay();
    displayServiceCards(service);
}

function updateServiceDisplay() {
    const serviceNames = {
        nannies: 'Nanny',
        cleaners: 'Cleaner',
        nurses: 'Nurse'
    };
    
    const selectedDisplay = document.getElementById('selectedServiceDisplay');
    if (selectedDisplay) {
        selectedDisplay.textContent = serviceNames[currentService] + 's';
    }
    
    const currentTitle = document.getElementById('currentServiceTitle');
    if (currentTitle) {
        currentTitle.textContent = serviceNames[currentService];
    }
    
    const serviceSelect = document.getElementById('profileService');
    if (serviceSelect) {
        serviceSelect.value = currentService;
        profileData.service = currentService;
    }
}

// ==================== CLEAR FORM ====================
function clearForm() {
    document.getElementById('profileName').value = '';
    document.getElementById('profileRole').value = '';
    document.getElementById('profileRate').value = '';
    document.getElementById('profileExp').value = '';
    document.getElementById('profileLoc').value = '';
    document.getElementById('profileBio').value = '';
    
    profileData = {
        name: '',
        role: '',
        rate: '',
        experience: '',
        location: '',
        service: currentService,
        rating: '★★★★☆',
        bio: '',
        profilePic: null,
        profilePicFile: null,
        experiencePhotos: [],
        experiencePhotoFiles: [],
        documents: [],
        documentFiles: [],
        video: null,
        videoFile: null
    };
    
    resetMediaUI();
    updatePreview();
    showNotification('Form cleared');
}

function resetMediaUI() {
    const previewProfilePic = document.getElementById('previewProfilePic');
    const avatarInitials = document.getElementById('avatarInitials');
    if (previewProfilePic) {
        previewProfilePic.src = '';
        previewProfilePic.style.display = 'none';
    }
    if (avatarInitials) {
        avatarInitials.style.display = 'block';
        avatarInitials.textContent = 'AR';
    }
    
    const photoGrid = document.getElementById('photoGrid');
    const addBtn = document.getElementById('addPhotoBtn');
    if (photoGrid && addBtn) {
        const items = photoGrid.querySelectorAll('.photo-item');
        items.forEach(item => item.remove());
    }
    
    const certList = document.getElementById('certificatesList');
    const addCertBtn = document.getElementById('addCertificateBtn');
    if (certList && addCertBtn) {
        const items = certList.querySelectorAll('.document-item');
        items.forEach(item => item.remove());
    }
    
    const videoUpload = document.getElementById('videoUpload');
    const videoPreview = document.getElementById('videoPreview');
    const videoIndicator = document.getElementById('previewVideoIndicator');
    
    if (videoUpload) videoUpload.style.display = 'flex';
    if (videoPreview) videoPreview.style.display = 'none';
    if (videoIndicator) videoIndicator.style.display = 'none';
    
    const previewPhotos = document.getElementById('previewPhotos');
    const previewDocs = document.getElementById('previewDocs');
    
    if (previewPhotos) previewPhotos.innerHTML = '';
    if (previewDocs) previewDocs.innerHTML = '';
}

// ==================== LIVE PREVIEW ====================
function updatePreview() {
    const previewName = document.getElementById('previewFullName');
    const previewRole = document.getElementById('previewRole');
    const previewRate = document.getElementById('previewRate');
    const previewExp = document.getElementById('previewExp');
    const previewLoc = document.getElementById('previewLoc');
    const previewRating = document.getElementById('previewRating');
    const previewBio = document.getElementById('previewBio');
    const avatarInitials = document.getElementById('avatarInitials');
    const previewPic = document.getElementById('previewProfilePic');
    
    if (previewName) previewName.textContent = profileData.name || 'Your Name';
    if (previewRole) previewRole.textContent = profileData.role || 'Professional Title';
    if (previewRate) previewRate.textContent = profileData.rate || 'R000/hour';
    if (previewExp) previewExp.textContent = profileData.experience || '0 months';
    if (previewLoc) previewLoc.textContent = profileData.location || 'Your Location';
    if (previewRating) previewRating.textContent = profileData.rating || '★★★★☆';
    if (previewBio) previewBio.textContent = profileData.bio || 'Tell people about yourself...';
    
    if (profileData.profilePic && previewPic) {
        previewPic.src = profileData.profilePic;
        previewPic.style.display = 'block';
        if (avatarInitials) avatarInitials.style.display = 'none';
    } else if (avatarInitials) {
        if (previewPic) previewPic.style.display = 'none';
        avatarInitials.style.display = 'block';
        const name = profileData.name || 'Your Name';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        avatarInitials.textContent = initials || '?';
    }
}

// ==================== TAB SWITCHING ====================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + '-tab').classList.add('active');
}

// ==================== MEDIA UPLOADS ====================
function handleProfilePicUpload(input) {
    console.log('handleProfilePicUpload called with:', input.files);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        console.log('File selected:', file.name, file.type, file.size);
        profileData.profilePicFile = file;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            console.log('FileReader loaded successfully');
            profileData.profilePic = e.target.result;
            updatePreview();
            showNotification('Profile picture ready to upload');
        };
        reader.onerror = function(e) {
            console.error('FileReader error:', e);
            showNotification('Error reading file', 'error');
        };
        reader.readAsDataURL(file);
    } else {
        console.log('No file selected');
    }
}

function handlePhotoUpload(input) {
    console.log('handlePhotoUpload called with:', input.files);
    if (input.files && input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            profileData.experiencePhotoFiles.push(file);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                profileData.experiencePhotos.push(e.target.result);
                displayPhotoThumbnail(e.target.result);
                updatePhotoPreview();
            };
            reader.readAsDataURL(file);
        });
        showNotification(input.files.length + ' photo(s) ready to upload');
    }
}

function displayPhotoThumbnail(imageData) {
    const photoGrid = document.getElementById('photoGrid');
    const addButton = document.getElementById('addPhotoBtn');
    
    if (!photoGrid || !addButton) return;
    
    const photoItem = document.createElement('div');
    photoItem.className = 'photo-item';
    photoItem.innerHTML = `
        <img src="${imageData}" alt="Experience photo">
        <button class="remove-photo" onclick="removePhoto(this)">×</button>
    `;
    
    photoGrid.insertBefore(photoItem, addButton);
}

function removePhoto(btn) {
    const photoItem = btn.closest('.photo-item');
    if (!photoItem) return;
    
    const imgSrc = photoItem.querySelector('img')?.src;
    if (imgSrc) {
        profileData.experiencePhotos = profileData.experiencePhotos.filter(src => src !== imgSrc);
    }
    photoItem.remove();
    updatePhotoPreview();
    showNotification('Photo removed');
}

function updatePhotoPreview() {
    const previewPhotos = document.getElementById('previewPhotos');
    if (previewPhotos) {
        previewPhotos.innerHTML = '';
        
        profileData.experiencePhotos.slice(0, 3).forEach(photo => {
            const thumb = document.createElement('img');
            thumb.src = photo;
            thumb.className = 'preview-photo-thumb';
            thumb.alt = 'Experience';
            previewPhotos.appendChild(thumb);
        });
        
        if (profileData.experiencePhotos.length > 3) {
            const more = document.createElement('span');
            more.className = 'doc-badge';
            more.textContent = `+${profileData.experiencePhotos.length - 3} more`;
            previewPhotos.appendChild(more);
        }
    }
}

function handleCVUpload(input) {
    console.log('handleCVUpload called with:', input.files);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        profileData.documentFiles.push(file);
        
        const docInfo = {
            name: file.name,
            type: 'CV',
            size: (file.size / 1024).toFixed(1) + ' KB'
        };
        
        profileData.documents = profileData.documents.filter(d => d.type !== 'CV');
        profileData.documents.push(docInfo);
        
        displayDocument('CV', file.name);
        updateDocumentsPreview();
        showNotification('CV ready to upload');
    }
}

function handleCertificateUpload(input) {
    console.log('handleCertificateUpload called with:', input.files);
    if (input.files && input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            profileData.documentFiles.push(file);
            
            const docInfo = {
                name: file.name,
                type: 'Certificate',
                size: (file.size / 1024).toFixed(1) + ' KB'
            };
            
            profileData.documents.push(docInfo);
            displayDocument('Certificate', file.name);
        });
        updateDocumentsPreview();
        showNotification(input.files.length + ' certificate(s) ready to upload');
    }
}

function displayDocument(type, name) {
    const certList = document.getElementById('certificatesList');
    const addButton = document.getElementById('addCertificateBtn');
    
    if (!certList || !addButton) return;
    
    const docItem = document.createElement('div');
    docItem.className = 'document-item';
    docItem.innerHTML = `
        <span class="document-icon">${type === 'CV' ? '📄' : '📜'}</span>
        <div class="document-info">
            <div class="document-name">${name}</div>
            <small>${type}</small>
        </div>
        <button class="remove-doc" onclick="removeDocument(this, '${name.replace(/'/g, "\\'")}')">×</button>
    `;
    
    certList.insertBefore(docItem, addButton);
}

function removeDocument(btn, fileName) {
    const docItem = btn.closest('.document-item');
    
    profileData.documents = profileData.documents.filter(d => d.name !== fileName);
    docItem.remove();
    updateDocumentsPreview();
    showNotification('Document removed');
}

function updateDocumentsPreview() {
    const previewDocs = document.getElementById('previewDocs');
    if (previewDocs) {
        previewDocs.innerHTML = '';
        
        profileData.documents.forEach(doc => {
            const badge = document.createElement('span');
            badge.className = 'doc-badge';
            badge.innerHTML = `${doc.type === 'CV' ? '📄' : '📜'} ${doc.type}`;
            badge.title = doc.name;
            previewDocs.appendChild(badge);
        });
    }
}

function handleVideoUpload(input) {
    console.log('handleVideoUpload called with:', input.files);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        if (!file.type.startsWith('video/')) {
            showNotification('Please upload a video file', 'error');
            return;
        }
        
        if (file.size > 50 * 1024 * 1024) {
            showNotification('Video must be less than 50MB', 'error');
            return;
        }
        
        profileData.videoFile = file;
        
        if (profileData.video) {
            URL.revokeObjectURL(profileData.video);
        }
        
        const videoUrl = URL.createObjectURL(file);
        profileData.video = videoUrl;
        
        const videoUpload = document.getElementById('videoUpload');
        const videoPreview = document.getElementById('videoPreview');
        const videoSource = document.getElementById('videoSource');
        const videoPlayer = document.getElementById('profileVideo');
        
        if (videoUpload) videoUpload.style.display = 'none';
        if (videoPreview) videoPreview.style.display = 'block';
        
        if (videoSource && videoPlayer) {
            videoSource.src = videoUrl;
            videoSource.type = file.type;
            videoPlayer.load();
        }
        
        const videoIndicator = document.getElementById('previewVideoIndicator');
        if (videoIndicator) {
            videoIndicator.style.display = 'block';
        }
        
        showNotification('Video ready to upload');
    }
}

function removeVideo() {
    if (profileData.video) {
        URL.revokeObjectURL(profileData.video);
        profileData.video = null;
        profileData.videoFile = null;
    }
    
    const videoUpload = document.getElementById('videoUpload');
    const videoPreview = document.getElementById('videoPreview');
    const videoIndicator = document.getElementById('previewVideoIndicator');
    
    if (videoUpload) videoUpload.style.display = 'flex';
    if (videoPreview) videoPreview.style.display = 'none';
    if (videoIndicator) videoIndicator.style.display = 'none';
    
    showNotification('Video removed');
}

// ==================== DISPLAY CARDS ====================
function displayServiceCards(service) {
    const container = document.getElementById('serviceCards');
    if (!container) return;
    
    container.innerHTML = '';
    
    const professionalsList = professionals[service] || [];
    
    if (professionalsList.length === 0) {
        container.innerHTML = '<div class="no-results">No professionals found in this category yet. Be the first to create a profile!</div>';
        return;
    }
    
    professionalsList.forEach(pro => {
        const card = document.createElement('div');
        card.className = 'container';
        
        // Handle profile picture with fallback
        let profileImage = pro.profilePic;
        if (!profileImage) {
            const nameParts = pro.name.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            profileImage = `https://ui-avatars.com/api/?name=${firstName}+${lastName}&background=2563eb&color=fff&size=200&bold=true&length=2`;
        }
        
        card.innerHTML = `
            <img src="${profileImage}" alt="${pro.name}" onerror="this.src='https://ui-avatars.com/api/?name=${pro.name.split(' ')[0]}+${pro.name.split(' ')[1] || ''}&background=2563eb&color=fff&size=200'">
            <div>
                <h4>${pro.name}</h4>
                <p>${pro.rating}</p>
                <p>${pro.role}</p>
                <p>${pro.experience} exp</p>
                <p>${pro.rate}</p>
                <p>${pro.location}</p>
                ${pro.video ? '<p>🎥 Has video intro</p>' : ''}
                ${pro.documents?.length ? `<p>📄 ${pro.documents.length} document(s)</p>` : ''}
                <button onclick="enquire('${pro.name}')">Enquire</button>
                <button onclick="hire('${pro.name}')">Hire</button>
                <button onclick="viewProfile('${pro.name}')">View Profile</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// ==================== UTILITY FUNCTIONS ====================
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${type === 'success' ? '#00a098' : type === 'error' ? '#dc3545' : '#0c2624'};
        color: white;
        padding: 15px 25px;
        border-radius: 7px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function setLocation() {
    const location = prompt("Enter your location:", "Mbombela");
    if (location && location.trim() !== "") {
        const locInput = document.getElementById('profileLoc');
        if (locInput) {
            locInput.value = location;
            profileData.location = location;
            updatePreview();
        }
        showNotification(`Location set to ${location}`);
    }
}

function search() {
    const searchTerm = document.getElementById('searchInput')?.value;
    if (searchTerm && searchTerm.trim() !== "") {
        showNotification(`Searching for: ${searchTerm}`);
    } else {
        showNotification('Please enter a search term');
    }
}

function enquire(name) {
    showNotification(`Enquiry sent to ${name}`);
}

function hire(name) {
    showNotification(`Hire request sent to ${name}`);
}

function viewProfile(name) {
    showNotification(`Viewing ${name}'s profile`);
}

function browseService(service) {
    switchService(service);
}

function switchPage(page) {
    showNotification(`Navigating to ${page} page`);
}

function reveal() {
    showNotification('More options coming soon!');
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    showNotification('Dark mode toggled');
}

// ========== AI INTERVIEW ==========
let currentQuestions = [];
let currentQuestionIndex = 0;
let interviewSessionId = null;
let totalScore = 0;
let answeredQuestions = 0;
let interviewResults = [];

// Get service type from the profile service select
const serviceSelect = document.getElementById('profileService');
let serviceType = 'nannies';
if (serviceSelect) {
    serviceType = serviceSelect.value;
}

// Set role and skills based on service type
let role = 'Domestic Worker';
let skills = ['reliability', 'trustworthiness', 'hard work'];

if (serviceType === 'nannies') {
    role = 'Nanny / Childcare Provider';
    skills = ['childcare', 'patience', 'safety', 'first aid', 'child development'];
} else if (serviceType === 'cleaners') {
    role = 'Professional Cleaner';
    skills = ['cleaning techniques', 'organization', 'attention to detail', 'time management', 'chemical safety'];
} else if (serviceType === 'nurses') {
    role = 'Elderly Care Nurse / Caregiver';
    skills = ['patient care', 'compassion', 'medical knowledge', 'hygiene', 'emergency response'];
}

const experience = 'Any experience level welcome';
const questionCount = 5;

const startInterviewBtn = document.getElementById('startInterviewBtn');
const rotatorInterview = document.getElementById('rotator-interview');
const answerInput = document.getElementById('answerInput');
const sendAnswerBtn = document.getElementById('sendAnswerBtn');
const voiceRecordBtn = document.getElementById('voiceRecordBtn');
const recordingStatus = document.getElementById('recordingStatus');
const questionNumber = document.getElementById('questionNumber');
const questionText = document.getElementById('questionText');
const questionProgress = document.getElementById('questionProgress');
const scoreDisplay = document.getElementById('scoreDisplay');

if (startInterviewBtn) {
    startInterviewBtn.addEventListener('click', async () => {
        startInterviewBtn.disabled = true;
        startInterviewBtn.textContent = 'Loading questions...';

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Please log in first');
                window.location.href = 'login.html';
                return;
            }

            console.log('Fetching questions for role:', role);
            
            const response = await fetch('http://localhost:3000/api/interview/questions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role, skills, experience, questionCount })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Questions response:', data);

            if (data.success && data.questions && data.questions.length > 0) {
                currentQuestions = data.questions;
                currentQuestionIndex = 0;
                totalScore = 0;
                answeredQuestions = 0;
                interviewResults = [];
                interviewSessionId = data.sessionId;
                showNextQuestion();
                answerInput.disabled = false;
                sendAnswerBtn.disabled = false;
                if (voiceRecordBtn) voiceRecordBtn.disabled = false;
            } else {
                console.error('No questions in response:', data);
                alert('No questions received. Please try again.');
            }
        } catch (err) {
            console.error('Question fetch error:', err);
            alert('Network error – could not fetch questions. Please check if backend is running.');
        } finally {
            startInterviewBtn.disabled = false;
            startInterviewBtn.textContent = 'Start Interview';
        }
    });
}

function showNextQuestion() {
    if (!rotatorInterview) {
        console.error('❌ Cannot show question - rotator element not found');
        return;
    }
    
    if (currentQuestions && currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
        const q = currentQuestions[currentQuestionIndex];
        
        if (questionNumber) questionNumber.textContent = `Question ${currentQuestionIndex + 1} of ${currentQuestions.length}`;
        if (questionText) questionText.textContent = q.question;
        if (questionProgress) questionProgress.textContent = `${currentQuestionIndex + 1}/${currentQuestions.length} answered`;
        if (answerInput) answerInput.value = '';
        if (answerInput) answerInput.focus();
        
        console.log('✅ Question displayed:', q.question.substring(0, 50) + '...');
    } else {
        // Interview completed - calculate average score
        const averageScore = answeredQuestions > 0 ? Math.round(totalScore / answeredQuestions) : 0;
        
        if (rotatorInterview) {
            rotatorInterview.innerHTML = `
                <div style="text-align: center; padding: 1rem;">
                    <span style="font-size: 2rem;">🎉</span>
                    <h3>Interview Completed!</h3>
                    <div style="font-size: 1.5rem; font-weight: bold; margin: 0.5rem 0;">Your Score: ${averageScore}%</div>
                    <p>Thank you for completing the interview.</p>
                </div>
            `;
        }
        
        if (sendAnswerBtn) sendAnswerBtn.disabled = true;
        if (answerInput) answerInput.disabled = true;
        if (voiceRecordBtn) voiceRecordBtn.disabled = true;
        if (questionProgress) questionProgress.textContent = `${currentQuestions.length}/${currentQuestions.length} completed`;
        
        // Save results to database
        saveInterviewResults(averageScore);
    }
}

async function saveInterviewResults(averageScore) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/api/interview/save-results', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                sessionId: interviewSessionId,
                results: interviewResults,
                totalScore: averageScore,
                role: role,
                completedAt: new Date().toISOString()
            })
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('✅ Interview results saved to database');
        } else {
            console.error('Failed to save results:', data.error);
        }
    } catch (err) {
        console.error('Error saving results:', err);
    }
}

if (sendAnswerBtn) {
    sendAnswerBtn.addEventListener('click', async () => {
        if (!currentQuestions || !currentQuestions.length || currentQuestionIndex >= currentQuestions.length) {
            alert('No active question.');
            return;
        }

        if (!answerInput) {
            alert('Answer input not found');
            return;
        }

        const answer = answerInput.value.trim();
        if (!answer) {
            alert('Please enter an answer.');
            return;
        }

        const currentQ = currentQuestions[currentQuestionIndex];

        sendAnswerBtn.disabled = true;
        sendAnswerBtn.textContent = 'Evaluating...';

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/interview/submit-answer', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    questionId: currentQ.id || currentQuestionIndex + 1,
                    question: currentQ.question,
                    answer: answer,
                    expectedKeywords: currentQ.expectedKeywords || []
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                const evalData = data.evaluation;
                
                // Store result for final score calculation
                totalScore += evalData.score || 0;
                answeredQuestions++;
                
                // Store full results for admin view
                interviewResults.push({
                    question: currentQ.question,
                    answer: answer,
                    score: evalData.score,
                    feedback: evalData.feedback,
                    strengths: evalData.strengths,
                    improvements: evalData.improvements
                });
                
                // Simple confirmation for user
                alert('✅ Answer recorded!');
                
                // Update progress display
                if (scoreDisplay) scoreDisplay.textContent = `Score: ${Math.round(totalScore / answeredQuestions)}% avg`;
                
                // Move to next question
                currentQuestionIndex++;
                showNextQuestion();
            } else {
                alert('Error evaluating answer: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Answer submission error:', err);
            alert('Network error – could not submit answer. Please try again.');
        } finally {
            sendAnswerBtn.disabled = false;
            sendAnswerBtn.textContent = 'Send Answer';
        }
    });
}

// Allow Enter key to send answer
if (answerInput) {
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && sendAnswerBtn && !sendAnswerBtn.disabled) {
            sendAnswerBtn.click();
        }
    });
}

// Voice recording
if (voiceRecordBtn) {
    let recognition = null;
    let isRecording = false;
    
    function initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.log('Speech recognition not supported');
            voiceRecordBtn.disabled = true;
            return false;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            
            if (answerInput) answerInput.value = transcript;
            
            if (event.results[0].isFinal) {
                if (recordingStatus) {
                    recordingStatus.textContent = '✓ Voice captured!';
                    recordingStatus.style.backgroundColor = '#10b981';
                    setTimeout(() => {
                        recordingStatus.style.display = 'none';
                    }, 2000);
                }
                if (voiceRecordBtn) {
                    voiceRecordBtn.innerHTML = '🎤 Record Voice';
                    voiceRecordBtn.classList.remove('recording');
                }
                isRecording = false;
            }
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (recordingStatus) {
                recordingStatus.textContent = `Error: ${event.error}`;
                recordingStatus.style.backgroundColor = '#ef4444';
                setTimeout(() => {
                    recordingStatus.style.display = 'none';
                }, 2000);
            }
            if (voiceRecordBtn) {
                voiceRecordBtn.innerHTML = '🎤 Record Voice';
                voiceRecordBtn.classList.remove('recording');
            }
            isRecording = false;
        };
        
        recognition.onend = () => {
            if (isRecording) {
                if (voiceRecordBtn) {
                    voiceRecordBtn.innerHTML = '🎤 Record Voice';
                    voiceRecordBtn.classList.remove('recording');
                }
                if (recordingStatus) {
                    recordingStatus.style.display = 'none';
                }
                isRecording = false;
            }
        };
        
        return true;
    }
    
    voiceRecordBtn.addEventListener('click', () => {
        if (!recognition) {
            const supported = initSpeechRecognition();
            if (!supported) {
                alert('Speech recognition not supported in this browser. Please use Chrome or Edge.');
                return;
            }
        }
        
        if (!isRecording) {
            try {
                recognition.start();
                isRecording = true;
                voiceRecordBtn.innerHTML = '⏹️ Stop Recording';
                voiceRecordBtn.classList.add('recording');
                if (recordingStatus) {
                    recordingStatus.textContent = '🔴 Recording...';
                    recordingStatus.style.backgroundColor = '#ef4444';
                    recordingStatus.style.display = 'block';
                }
            } catch (error) {
                console.error('Failed to start recording:', error);
            }
        } else {
            recognition.stop();
            isRecording = false;
            voiceRecordBtn.innerHTML = '🎤 Record Voice';
            voiceRecordBtn.classList.remove('recording');
            if (recordingStatus) {
                recordingStatus.textContent = '✓ Stopped';
                recordingStatus.style.backgroundColor = '#10b981';
                setTimeout(() => {
                    recordingStatus.style.display = 'none';
                }, 2000);
            }
        }
    });
}

// ========== FACIAL VERIFICATION ==========
const video = document.getElementById('live-stream');
const btnAction = document.getElementById('btn-action');
const errorDisplay = document.getElementById('error-display');
const idFileInput = document.getElementById('idBook');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const verificationResult = document.getElementById('verificationResult');
const cameraStatus = document.getElementById('cameraStatus');

// Start camera automatically
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (video) {
            video.srcObject = stream;
            video.style.display = 'block';
            if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';
            if (cameraStatus) cameraStatus.textContent = '✅ Camera ready';
        }
    } catch (err) {
        if (cameraStatus) cameraStatus.textContent = '❌ Camera access denied';
        if (errorDisplay) errorDisplay.textContent = 'Camera access denied. Please check permissions.';
        console.error('Camera error:', err);
    }
}

if (video) startCamera();

// Verification button click
if (btnAction) {
    btnAction.addEventListener('click', async (event) => {
        event.preventDefault();

        if (!idFileInput || !idFileInput.files.length) {
            alert('Please select an ID photo first.');
            return;
        }

        if (!video || !video.videoWidth || video.videoWidth === 0) {
            alert('Camera is not ready. Please wait a moment and try again.');
            return;
        }

        // Update status
        if (cameraStatus) cameraStatus.textContent = '📸 Capturing photo...';
        if (btnAction) btnAction.textContent = 'Verifying...';
        btnAction.disabled = true;

        // Capture frame from video
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        const livePhotoBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        const livePhotoFile = new File([livePhotoBlob], 'live-photo.jpg', { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('livePhoto', livePhotoFile);
        formData.append('idPhoto', idFileInput.files[0]);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/verify-identity', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            const data = await response.json();
            console.log('Verification result:', data);

            if (data.success) {
                const matchScore = data.verification.matchScore || 0;
                const isSame = data.verification.isSamePerson;
                
                if (verificationResult) {
                    if (isSame && matchScore > 70) {
                        verificationResult.innerHTML = `
                            <div class="verification-success">
                                <span class="result-icon">✅</span>
                                <div>
                                    <strong>Identity Verified!</strong>
                                    <p>Match Score: ${matchScore}%</p>
                                    <small>${data.verification.explanation || 'Successfully verified'}</small>
                                </div>
                            </div>
                        `;
                        if (cameraStatus) cameraStatus.textContent = '✅ Verified successfully!';
                    } else {
                        verificationResult.innerHTML = `
                            <div class="verification-failed">
                                <span class="result-icon">❌</span>
                                <div>
                                    <strong>Verification Failed</strong>
                                    <p>Score: ${matchScore}%</p>
                                    <small>${data.verification.explanation || 'Could not verify identity'}</small>
                                </div>
                            </div>
                        `;
                        if (cameraStatus) cameraStatus.textContent = '❌ Verification failed';
                    }
                }
                
                if (isSame && matchScore > 70) {
                    alert(`✅ Identity verified! Match score: ${matchScore}%`);
                } else {
                    alert(`❌ Verification failed. Score: ${matchScore}% – ${data.verification.explanation || ''}`);
                }
            } else {
                alert('Error: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Verification fetch error:', err);
            alert('Network error – check if backend is running.');
        } finally {
            if (btnAction) {
                btnAction.disabled = false;
                btnAction.textContent = 'Start Verification';
            }
            if (cameraStatus) cameraStatus.textContent = '✅ Camera ready';
        }
    });
}

// ID upload status
if (idFileInput) {
    idFileInput.addEventListener('change', function() {
        const idStatus = document.getElementById('idStatus');
        if (idStatus && this.files.length) {
            idStatus.innerHTML = `✅ ID selected: ${this.files[0].name}`;
            idStatus.className = 'status-badge success';
        }
    });
}

// Initially disable interview controls
if (answerInput) answerInput.disabled = true;
if (sendAnswerBtn) sendAnswerBtn.disabled = true;
if (voiceRecordBtn) voiceRecordBtn.disabled = true;