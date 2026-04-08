/**
 * my-applications.js - Track job applications for helpers
 */

const API_BASE_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    if (user.user_role !== 'helper') {
        alert('Only helpers can access this page');
        window.location.href = 'index.html';
        return;
    }
    
    await loadApplications();
});

async function loadApplications() {
    const container = document.getElementById('applicationsList');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading applications...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/business/my-applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.applications.length > 0) {
            displayApplications(data.applications);
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <div class="empty-title">No applications yet</div>
                    <div class="empty-message">Browse jobs and apply to get started</div>
                    <a href="jobs.html" class="btn-primary">Find Jobs</a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Load applications error:', error);
        container.innerHTML = '<div class="empty-state">Error loading applications</div>';
    }
}

function displayApplications(applications) {
    const container = document.getElementById('applicationsList');
    if (!container) return;
    
    container.innerHTML = applications.map(app => `
        <div class="application-card">
            <div class="application-header">
                <div>
                    <div class="job-title">${escapeHtml(app.title)}</div>
                    <div class="company-name">${escapeHtml(app.company_name)}</div>
                </div>
                <div>
                    <span class="application-status status-${app.status}">${formatStatus(app.status)}</span>
                </div>
            </div>
            <div class="application-details">
                <div><strong>📍 Location:</strong> ${app.location || 'Remote'}</div>
                <div><strong>💼 Type:</strong> ${formatEmploymentType(app.employment_type)}</div>
                <div><strong>💰 Salary:</strong> ${formatSalary(app.salary_min, app.salary_max)}</div>
                <div><strong>📅 Applied:</strong> ${new Date(app.created_at).toLocaleDateString()}</div>
                ${app.cover_letter ? `<div><strong>📝 Your message:</strong> "${escapeHtml(app.cover_letter)}"</div>` : ''}
            </div>
            <div style="margin-top: 1rem;">
                <button class="btn-secondary" onclick="viewJob(${app.job_id})">View Job Details</button>
            </div>
        </div>
    `).join('');
}

function viewJob(jobId) {
    window.location.href = `job-detail.html?id=${jobId}`;
}

function formatStatus(status) {
    const statuses = {
        'pending': 'Pending Review',
        'reviewed': 'Reviewed',
        'shortlisted': 'Shortlisted',
        'rejected': 'Not Selected',
        'hired': 'Hired!'
    };
    return statuses[status] || status;
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
    return 'Not specified';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.viewJob = viewJob;