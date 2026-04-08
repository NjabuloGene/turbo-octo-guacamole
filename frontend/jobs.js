/**
 * jobs.js - Browse and apply for jobs
 */

const API_BASE_URL = 'http://localhost:3000';
let allJobs = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    setupEventListeners();
    await loadJobs();
});

function setupEventListeners() {
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', filterJobs);
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') filterJobs();
        });
    }
}

async function loadJobs() {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading jobs...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/jobs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            allJobs = data.jobs;
            displayJobs(allJobs);
        } else {
            container.innerHTML = '<div class="empty-state">No jobs available</div>';
        }
    } catch (error) {
        console.error('Load jobs error:', error);
        container.innerHTML = '<div class="empty-state">Error loading jobs. Please refresh.</div>';
    }
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">No jobs match your criteria</div>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <div class="job-title">${escapeHtml(job.title)}</div>
            <div class="job-company">${escapeHtml(job.company_name)}</div>
            <div class="job-details">
                <span>📍 ${job.location || 'Remote'}</span>
                <span>💼 ${formatEmploymentType(job.employment_type)}</span>
                <span>📅 Posted ${formatDate(job.created_at)}</span>
            </div>
            <div class="job-description">${escapeHtml(job.description.substring(0, 200))}${job.description.length > 200 ? '...' : ''}</div>
            ${job.requirements?.length ? `
                <div class="job-skills">
                    ${job.requirements.map(skill => `<span class="skill-badge">${escapeHtml(skill)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="job-footer">
                <span class="salary">💰 ${formatSalary(job.salary_min, job.salary_max)}</span>
                ${job.hasApplied ? 
                    `<span class="already-applied">✓ Applied</span>` :
                    `<button class="btn-primary apply-btn" onclick="applyForJob(${job.id})">Apply Now</button>`
                }
            </div>
        </div>
    `).join('');
}

function filterJobs() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const locationFilter = document.getElementById('locationFilter')?.value.toLowerCase() || '';
    const employmentFilter = document.getElementById('employmentFilter')?.value;
    
    let filtered = [...allJobs];
    
    if (searchTerm) {
        filtered = filtered.filter(job => 
            job.title.toLowerCase().includes(searchTerm) ||
            job.description.toLowerCase().includes(searchTerm)
        );
    }
    
    if (locationFilter) {
        filtered = filtered.filter(job => 
            job.location?.toLowerCase().includes(locationFilter)
        );
    }
    
    if (employmentFilter) {
        filtered = filtered.filter(job => job.employment_type === employmentFilter);
    }
    
    displayJobs(filtered);
}

async function applyForJob(jobId) {
    if (!confirm('Are you sure you want to apply for this position?')) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/jobs/${jobId}/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                cover_letter: 'I am interested in this position. Please review my profile.'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Application submitted successfully!');
            await loadJobs();
        } else {
            alert(data.error || 'Failed to apply');
        }
    } catch (error) {
        console.error('Apply error:', error);
        alert('Network error - please try again');
    }
}

function formatEmploymentType(type) {
    const types = {
        'full_time': 'Full-time',
        'part_time': 'Part-time',
        'contract': 'Contract',
        'temporary': 'Temporary',
        'internship': 'Internship'
    };
    return types[type] || type;
}

function formatSalary(min, max) {
    if (min && max) return `R${min.toLocaleString()} - R${max.toLocaleString()}`;
    if (min) return `From R${min.toLocaleString()}`;
    if (max) return `Up to R${max.toLocaleString()}`;
    return 'Salary not specified';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}