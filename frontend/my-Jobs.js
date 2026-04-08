/**
 * my-jobs.js - Manage posted jobs and applications
 */

const API_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    if (user.user_role !== 'hirer') {
        alert('Only employers can access this page');
        window.location.href = 'index.html';
        return;
    }
    
    await loadMyJobs();
});

async function loadMyJobs() {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading your jobs...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/jobs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            // Filter jobs owned by this employer (based on business)
            const myJobs = data.jobs;
            displayJobs(myJobs);
        } else {
            container.innerHTML = '<div class="empty-state">No jobs posted yet</div>';
        }
    } catch (error) {
        console.error('Load jobs error:', error);
        container.innerHTML = '<div class="empty-state">Error loading jobs</div>';
    }
}

function displayJobs(jobs) {
    const container = document.getElementById('jobsList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-title">No jobs posted yet</div>
                <div class="empty-message">Post your first job to start finding talent</div>
                <a href="post-job.html" class="btn-primary">Post a Job</a>
            </div>
        `;
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div class="job-card">
            <div class="job-header">
                <div>
                    <div class="job-title">${escapeHtml(job.title)}</div>
                    <div class="job-stats">
                        <span>📍 ${job.location || 'Remote'}</span>
                        <span>💼 ${formatEmploymentType(job.employment_type)}</span>
                        <span>📅 Posted ${formatDate(job.created_at)}</span>
                    </div>
                </div>
                <div>
                    <span class="job-status status-${job.status}">${job.status}</span>
                </div>
            </div>
            <div class="job-description">${escapeHtml(job.description.substring(0, 150))}...</div>
            <div class="job-stats">
                <span>💰 ${formatSalary(job.salary_min, job.salary_max)}</span>
                <span>👁️ ${job.view_count || 0} views</span>
                <span>📋 ${job.application_count || 0} applications</span>
            </div>
            <div class="applications-list" id="applications-${job.id}">
                <div class="loading-state-small">Loading applications...</div>
            </div>
        </div>
    `).join('');
    
    // Load applications for each job
    for (const job of jobs) {
        loadApplications(job.id);
    }
}

async function loadApplications(jobId) {
    const container = document.getElementById(`applications-${jobId}`);
    if (!container) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/my-job-applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const jobApps = data.applications.filter(app => app.job_id === jobId);
            displayApplications(jobId, jobApps);
        }
    } catch (error) {
        console.error('Load applications error:', error);
        container.innerHTML = '<div class="empty-state-small">Error loading applications</div>';
    }
}

function displayApplications(jobId, applications) {
    const container = document.getElementById(`applications-${jobId}`);
    if (!container) return;
    
    if (!applications || applications.length === 0) {
        container.innerHTML = '<div class="empty-state-small">No applications yet</div>';
        return;
    }
    
    container.innerHTML = applications.map(app => `
        <div class="application-item">
            <div>
                <div class="applicant-name">${escapeHtml(app.candidate_name)}</div>
                <div class="applicant-details">⭐ ${app.rating || 'No rating'} • 📅 ${app.experience || '0 months'}</div>
                ${app.cover_letter ? `<div class="applicant-message">"${escapeHtml(app.cover_letter.substring(0, 100))}"</div>` : ''}
            </div>
            <div class="application-actions">
                <select class="status-select" data-app-id="${app.id}" onchange="updateApplicationStatus(${app.id}, this.value)">
                    <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="reviewed" ${app.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                    <option value="shortlisted" ${app.status === 'shortlisted' ? 'selected' : ''}>Shortlist</option>
                    <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reject</option>
                    <option value="hired" ${app.status === 'hired' ? 'selected' : ''}>Hire</option>
                </select>
                <button class="btn-secondary btn-sm" onclick="viewCandidateProfile(${app.candidate_id})">View</button>
            </div>
        </div>
    `).join('');
}

async function updateApplicationStatus(appId, status) {
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
            alert(`Application ${status}!`);
            location.reload();
        } else {
            alert(data.error || 'Failed to update');
        }
    } catch (error) {
        console.error('Update error:', error);
        alert('Network error');
    }
}

function viewCandidateProfile(userId) {
    window.location.href = `profile.html?id=${userId}`;
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

window.updateApplicationStatus = updateApplicationStatus;
window.viewCandidateProfile = viewCandidateProfile;