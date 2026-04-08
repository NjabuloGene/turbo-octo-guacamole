/**
 * post-job.js - Handle job posting
 */

const API_BASE_URL = 'http://localhost:3000';
let skills = [];

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }
    
    if (user.user_role !== 'hirer') {
        alert('Only employers can post jobs');
        window.location.href = 'index.html';
        return;
    }
    
    setupSkillInput();
    setupFormSubmit();
});

function setupSkillInput() {
    const skillInput = document.getElementById('skillInput');
    const skillsList = document.getElementById('skillsList');
    
    if (!skillInput) return;
    
    skillInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const skill = skillInput.value.trim();
            if (skill && !skills.includes(skill)) {
                skills.push(skill);
                addSkillTag(skill);
                skillInput.value = '';
            }
        }
    });
}

function addSkillTag(skill) {
    const skillsList = document.getElementById('skillsList');
    const tag = document.createElement('span');
    tag.className = 'skill-tag';
    tag.innerHTML = `${skill} <span class="remove" onclick="this.parentElement.remove(); skills = skills.filter(s => s !== '${skill}')">×</span>`;
    skillsList.appendChild(tag);
}

function setupFormSubmit() {
    const form = document.getElementById('postJobForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('jobTitle')?.value;
        const description = document.getElementById('jobDescription')?.value;
        const employmentType = document.getElementById('employmentType')?.value;
        const salaryMin = document.getElementById('salaryMin')?.value;
        const salaryMax = document.getElementById('salaryMax')?.value;
        const location = document.getElementById('location')?.value;
        const remoteAllowed = document.getElementById('remoteAllowed')?.checked;
        const experienceRequired = document.getElementById('experienceRequired')?.value;
        const benefitsInput = document.getElementById('benefits')?.value;
        
        if (!title || !description) {
            alert('Please fill in job title and description');
            return;
        }
        
        const benefits = benefitsInput ? benefitsInput.split(',').map(b => b.trim()) : [];
        
        const jobData = {
            title,
            description,
            employment_type: employmentType,
            salary_min: salaryMin ? parseFloat(salaryMin) : null,
            salary_max: salaryMax ? parseFloat(salaryMax) : null,
            location: location || null,
            remote_allowed: remoteAllowed,
            requirements: skills,
            benefits: benefits,
            experience_required: experienceRequired || null
        };
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/api/business/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(jobData)
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                alert('Job posted successfully!');
                window.location.href = 'my-jobs.html';
            } else {
                alert(data.error || 'Failed to post job');
            }
        } catch (error) {
            console.error('Post job error:', error);
            alert('Network error - please try again');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}