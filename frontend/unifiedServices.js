/**
 * unifiedServices.js
 * Shared browse/filter/interact module for:
 *   elderlyCare.html  (data-service="nurses")
 *   nanniesPage.html  (data-service="nannies")
 *   cleanersSection.html (data-service="cleaners")
 *
 * Auth rules:
 *   - Cards & basic info: PUBLIC
 *   - Rate, interview score, Message, Hire, Bookmark: LOGIN REQUIRED
 */

(() => {
    'use strict';

    /* ═══════════════════════════════════════════
       CONFIG
    ═══════════════════════════════════════════ */
    const API   = 'http://localhost:3000';
    const TOKEN = () => localStorage.getItem('token');
    const USER  = () => {
        try { return JSON.parse(localStorage.getItem('user')); }
        catch { return null; }
    };
    const isLoggedIn = () => !!TOKEN() && !!USER();

    /* ═══════════════════════════════════════════
       STATE
    ═══════════════════════════════════════════ */
    let allProfiles    = [];
    let savedIds       = new Set();
    let activeChip     = 'all';
    let searchTerm     = '';
    let serviceType    = document.body.dataset.service || 'nurses';

    /* ═══════════════════════════════════════════
       BOOT
    ═══════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', boot);

    async function boot() {
        // Determine service from body attribute
        serviceType = document.body.dataset.service || 'nurses';

        // Wire up search
        const searchInput = document.getElementById('searchInput');
        const searchBtn   = document.getElementById('searchBtn');
        if (searchBtn)   searchBtn.addEventListener('click', () => runSearch());
        if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

        // Wire up filter chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                activeChip = this.dataset.filter || 'all';
                applyFilters();
            });
        });

        // Wire clear-filters
        const clearBtn = document.getElementById('clearFilters');
        if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

        // Load
        showLoading();
        if (isLoggedIn()) await fetchSaved();
        await fetchProfiles();
    }

    /* ═══════════════════════════════════════════
       FETCH
    ═══════════════════════════════════════════ */
    async function fetchProfiles() {
        try {
            const headers = isLoggedIn() ? { 'Authorization': `Bearer ${TOKEN()}` } : {};
            const res  = await fetch(`${API}/api/profiles?service=${serviceType}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.success && data.profiles?.length) {
                allProfiles = data.profiles;
                applyFilters();
            } else {
                showEmpty();
            }
        } catch (err) {
            console.error('[unifiedServices] fetchProfiles:', err);
            showError('Could not load professionals. Please check your connection.');
        }
    }

    async function fetchSaved() {
        try {
            const res  = await fetch(`${API}/api/saved-profiles`, {
                headers: { 'Authorization': `Bearer ${TOKEN()}` }
            });
            const data = await res.json();
            if (data.success) savedIds = new Set(data.savedProfiles.map(p => p.id));
        } catch (err) {
            console.warn('[unifiedServices] fetchSaved:', err);
        }
    }

    /* ═══════════════════════════════════════════
       FILTER & SORT
    ═══════════════════════════════════════════ */
    function runSearch() {
        searchTerm = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
        applyFilters();
    }

    function applyFilters() {
        let list = [...allProfiles];

        // Text search
        if (searchTerm.length >= 2) {
            list = list.filter(p =>
                p.name?.toLowerCase().includes(searchTerm) ||
                p.role?.toLowerCase().includes(searchTerm) ||
                p.location?.toLowerCase().includes(searchTerm) ||
                p.bio?.toLowerCase().includes(searchTerm)
            );
        }

        // Chip filter
        switch (activeChip) {
            case 'top-rated':  list = list.filter(p => (parseFloat(p.rating) || 0) >= 4.5); break;
            case 'verified':   list = list.filter(p => p.documents?.length > 0); break;
            case 'video':      list = list.filter(p => !!p.video); break;
        }

        // Sort: top-rated first, then by name
        list.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));

        renderGrid(list);
        updateResultsMeta(list.length);
    }

    function clearAllFilters() {
        searchTerm = '';
        activeChip = 'all';
        const si = document.getElementById('searchInput');
        if (si) si.value = '';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
        applyFilters();
    }

    /* ═══════════════════════════════════════════
       RENDER GRID
    ═══════════════════════════════════════════ */
    function renderGrid(profiles) {
        const grid = document.getElementById('profilesGrid');
        if (!grid) return;

        hideStates();
        grid.style.display = '';

        if (!profiles.length) { showEmpty(); return; }

        grid.innerHTML = profiles.map(p => buildCard(p)).join('');
    }

    /* ═══════════════════════════════════════════
       BUILD CARD
    ═══════════════════════════════════════════ */
    function buildCard(p) {
        const rating   = clampRating(p.rating);
        const stars    = buildStars(rating);
        const initials = getInitials(p.name);
        const isSaved  = savedIds.has(p.id);
        const loggedIn = isLoggedIn();

        const avatarHtml = p.profile_pic
            ? `<img src="${p.profile_pic}" alt="${esc(p.name)}" class="svc-card-avatar-img"
                    onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=00938a&color=fff&size=200'">`
            : `<div class="svc-card-avatar-initials">${initials}</div>`;

        const rateHtml = loggedIn
            ? `<span class="svc-card-rate">${esc(p.rate || 'R200/hour')}</span>`
            : `<span class="svc-card-rate rate-locked" title="Login to see rate">R•••/hour <span class="lock-icon">🔒</span></span>`;

        const badgesHtml = [
            rating >= 4.5 ? `<span class="svc-badge badge-top">⭐ Top Rated</span>` : '',
            p.video       ? `<span class="svc-badge badge-video">🎥 Video</span>` : '',
            p.documents?.length ? `<span class="svc-badge badge-verified">✓ Verified</span>` : '',
            p.interview_score && loggedIn ? `<span class="svc-badge badge-score">🎯 Score: ${p.interview_score}</span>` : '',
            p.interview_score && !loggedIn ? `<span class="svc-badge badge-score locked" title="Login to see AI score">🎯 AI Score 🔒</span>` : '',
        ].filter(Boolean).join('');

        return `
        <article class="svc-card" data-id="${p.id}" data-uid="${p.user_id}" onclick="SVC.openProfile(${p.id})">

            <!-- Bookmark -->
            ${loggedIn ? `
            <button class="svc-bookmark ${isSaved ? 'bookmarked' : ''}"
                    data-pid="${p.id}"
                    onclick="event.stopPropagation(); SVC.toggleBookmark(this, ${p.id})"
                    title="${isSaved ? 'Remove bookmark' : 'Bookmark'}">
                ${isSaved ? '★' : '☆'}
            </button>` : `
            <button class="svc-bookmark" onclick="event.stopPropagation(); SVC.promptLogin()" title="Login to bookmark">☆</button>`
            }

            <!-- Avatar -->
            <div class="svc-card-avatar">${avatarHtml}</div>

            <!-- Info -->
            <div class="svc-card-body">
                <div class="svc-card-name">${esc(p.name)}</div>
                <div class="svc-card-role">${esc(p.role || serviceLabel(serviceType))}</div>

                <div class="svc-card-rating">
                    <span class="svc-stars">${stars}</span>
                    <span class="svc-rating-val">${rating.toFixed(1)}</span>
                </div>

                ${rateHtml}

                <div class="svc-card-meta">
                    <span>📍 ${esc(p.location?.split(',')[0]?.trim() || 'South Africa')}</span>
                    <span>📅 ${esc(p.experience || '—')}</span>
                </div>

                <p class="svc-card-bio">${p.bio ? esc(p.bio.slice(0, 90)) + (p.bio.length > 90 ? '…' : '') : 'No bio provided.'}</p>

                <div class="svc-card-badges">${badgesHtml}</div>
            </div>

            <!-- Actions -->
            <div class="svc-card-actions">
                <button class="svc-btn svc-btn-primary" onclick="event.stopPropagation(); SVC.openProfile(${p.id})">
                    View Profile
                </button>
                ${loggedIn ? `
                <button class="svc-btn svc-btn-message" onclick="event.stopPropagation(); SVC.openMessage(${p.user_id}, ${p.id}, '${esc(p.name)}')">
                    💬 Message
                </button>
                <button class="svc-btn svc-btn-hire" onclick="event.stopPropagation(); SVC.openHire(${p.user_id}, ${p.id}, '${esc(p.name)}')">
                    🤝 Hire
                </button>
                ` : `
                <button class="svc-btn svc-btn-message" onclick="event.stopPropagation(); SVC.promptLogin()">
                    💬 Message
                </button>
                <button class="svc-btn svc-btn-hire" onclick="event.stopPropagation(); SVC.promptLogin()">
                    🤝 Hire
                </button>
                `}
            </div>
        </article>`;
    }

    /* ═══════════════════════════════════════════
       PROFILE MODAL
    ═══════════════════════════════════════════ */
    async function openProfile(profileId) {
        // Show a loading modal first
        const overlay = createOverlay();
        overlay.innerHTML = buildLoadingModal();
        document.body.appendChild(overlay);
        trapFocus(overlay);

        try {
            const headers = isLoggedIn() ? { 'Authorization': `Bearer ${TOKEN()}` } : {};
            const res  = await fetch(`${API}/api/profiles/${profileId}`, { headers });
            const data = await res.json();

            if (data.success) {
                overlay.innerHTML = buildProfileModal(data.profile);
                bindModalClose(overlay);
            } else {
                overlay.remove();
                showNotification('Could not load profile.', 'error');
            }
        } catch (err) {
            overlay.remove();
            showNotification('Network error loading profile.', 'error');
        }
    }

    function buildProfileModal(p) {
        const loggedIn = isLoggedIn();
        const rating   = clampRating(p.rating);
        const stars    = buildStars(rating);

        const avatarSrc = p.profile_pic || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=00938a&color=fff&size=300`;

        /* ── Interview score block ── */
        const scoreBlock = loggedIn && p.interview_score ? `
            <div class="modal-score-block">
                <div class="score-label">🎯 AI Interview Score</div>
                <div class="score-bar-wrap">
                    <div class="score-bar" style="width:${Math.min(100, p.interview_score)}%"></div>
                </div>
                <div class="score-value">${p.interview_score}/100</div>
                ${p.interview_summary ? `<p class="score-summary">${esc(p.interview_summary)}</p>` : ''}
            </div>` :
            !loggedIn ? `
            <div class="modal-score-block locked-block">
                <div class="score-label">🎯 AI Interview Score</div>
                <div class="locked-msg">🔒 <a href="login.html">Login</a> to view this helper's interview score and full rate details.</div>
            </div>` : '';

        /* ── Photos ── */
        const photosBlock = p.photos?.length ? `
            <div class="modal-section">
                <h4 class="modal-section-title">Experience Photos</h4>
                <div class="modal-photo-grid">
                    ${p.photos.map(ph => `<img src="${ph}" class="modal-photo" onclick="window.open('${ph}','_blank')" alt="Photo">`).join('')}
                </div>
            </div>` : '';

        /* ── Documents ── */
        const docsBlock = p.documents?.length ? `
            <div class="modal-section">
                <h4 class="modal-section-title">Certificates &amp; Documents</h4>
                <div class="modal-docs-list">
                    ${p.documents.map(d => `
                        <a href="${d}" target="_blank" class="modal-doc-item">
                            <span class="doc-icon-sm">📄</span>
                            <span>${d.split('/').pop()}</span>
                        </a>`).join('')}
                </div>
            </div>` : '';

        /* ── Video ── */
        const videoBlock = p.video ? `
            <div class="modal-section">
                <h4 class="modal-section-title">Introduction Video</h4>
                <video src="${p.video}" controls class="modal-video"></video>
            </div>` : '';

        /* ── Rate (login-gated) ── */
        const rateDisplay = loggedIn
            ? `<div class="modal-meta-item"><span class="mm-icon">💰</span><span>${esc(p.rate || 'R200/hour')}</span></div>`
            : `<div class="modal-meta-item"><span class="mm-icon">💰</span><span class="rate-locked">Rate hidden — <a href="login.html">login to view</a></span></div>`;

        /* ── Action buttons ── */
        const actions = loggedIn ? `
            <button class="svc-btn svc-btn-message" onclick="SVC.openMessage(${p.user_id}, ${p.id}, '${esc(p.name)}'); document.querySelector('.svc-overlay').remove()">
                💬 Message
            </button>
            <button class="svc-btn svc-btn-hire" onclick="SVC.openHire(${p.user_id}, ${p.id}, '${esc(p.name)}'); document.querySelector('.svc-overlay').remove()">
                🤝 Hire
            </button>` : `
            <button class="svc-btn svc-btn-primary" onclick="location.href='login.html'">
                🔒 Login to Contact
            </button>`;

        return `
        <div class="svc-modal">
            <button class="modal-close-btn" onclick="this.closest('.svc-overlay').remove()" aria-label="Close">✕</button>

            <!-- Header -->
            <div class="modal-profile-header">
                <img src="${avatarSrc}" class="modal-avatar"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=00938a&color=fff&size=300'"
                     alt="${esc(p.name)}">
                <div class="modal-profile-info">
                    <div class="modal-role">${esc(p.role || serviceLabel(serviceType))}</div>
                    <h2 class="modal-name">${esc(p.name)}</h2>
                    <div class="modal-stars">
                        <span class="svc-stars large">${stars}</span>
                        <span class="modal-rating-val">${rating.toFixed(1)} / 5</span>
                    </div>
                    <div class="modal-meta-row">
                        <div class="modal-meta-item"><span class="mm-icon">📍</span><span>${esc(p.location || 'South Africa')}</span></div>
                        <div class="modal-meta-item"><span class="mm-icon">📅</span><span>${esc(p.experience || '—')} experience</span></div>
                        ${rateDisplay}
                    </div>
                </div>
            </div>

            <!-- Interview Score -->
            ${scoreBlock}

            <!-- Bio -->
            ${p.bio ? `<div class="modal-section"><h4 class="modal-section-title">About</h4><p class="modal-bio-text">${esc(p.bio)}</p></div>` : ''}

            <!-- Media -->
            ${photosBlock}
            ${docsBlock}
            ${videoBlock}

            <!-- Actions -->
            <div class="modal-action-row">
                ${actions}
                <button class="svc-btn svc-btn-outline" onclick="this.closest('.svc-overlay').remove()">Close</button>
            </div>
        </div>`;
    }

    function buildLoadingModal() {
        return `<div class="svc-modal svc-modal-loading">
            <div class="modal-spinner"></div>
            <p>Loading profile…</p>
        </div>`;
    }

    /* ═══════════════════════════════════════════
       MESSAGE MODAL
    ═══════════════════════════════════════════ */
    function openMessage(receiverId, profileId, name) {
        if (!isLoggedIn()) { promptLogin(); return; }

        const overlay = createOverlay();
        overlay.innerHTML = `
        <div class="svc-modal svc-modal-sm">
            <button class="modal-close-btn" onclick="this.closest('.svc-overlay').remove()">✕</button>
            <h3 class="modal-form-title">Message ${esc(name)}</h3>
            <p class="modal-form-sub">Your message will be sent directly to their inbox.</p>
            <textarea id="svc-msg-text" class="modal-textarea" rows="5"
                placeholder="Hi! I'm interested in your services…"></textarea>
            <div class="modal-action-row">
                <button class="svc-btn svc-btn-primary" onclick="SVC._sendMessage(${receiverId}, ${profileId})">
                    Send Message
                </button>
                <button class="svc-btn svc-btn-outline" onclick="this.closest('.svc-overlay').remove()">Cancel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#svc-msg-text')?.focus();
        bindModalClose(overlay);
    }

    async function _sendMessage(receiverId, profileId) {
        const text = document.getElementById('svc-msg-text')?.value?.trim();
        if (!text) { showNotification('Please write a message first.', 'error'); return; }

        try {
            const res  = await fetch(`${API}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN()}` },
                body: JSON.stringify({ receiver_id: +receiverId, profile_id: profileId ? +profileId : null, message: text })
            });
            const data = await res.json();
            if (data.success) {
                document.querySelector('.svc-overlay')?.remove();
                showNotification('Message sent! ✓', 'success');
            } else {
                showNotification(data.error || 'Failed to send.', 'error');
            }
        } catch {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    /* ═══════════════════════════════════════════
       HIRE MODAL
    ═══════════════════════════════════════════ */
    function openHire(helperId, profileId, name) {
        if (!isLoggedIn()) { promptLogin(); return; }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const defaultDate = tomorrow.toISOString().split('T')[0];

        const overlay = createOverlay();
        overlay.innerHTML = `
        <div class="svc-modal svc-modal-sm">
            <button class="modal-close-btn" onclick="this.closest('.svc-overlay').remove()">✕</button>
            <h3 class="modal-form-title">Hire ${esc(name)}</h3>
            <p class="modal-form-sub">Tell ${esc(name.split(' ')[0])} when you need them and what the job entails.</p>

            <div class="modal-field">
                <label class="modal-label">Start Date <span class="req">*</span></label>
                <input type="date" id="svc-hire-date" class="modal-input" value="${defaultDate}" min="${defaultDate}">
            </div>
            <div class="modal-field">
                <label class="modal-label">Duration / Hours</label>
                <input type="text" id="svc-hire-duration" class="modal-input" placeholder="e.g. 4 hours · 1 week · ongoing">
            </div>
            <div class="modal-field">
                <label class="modal-label">Message <span class="modal-optional">(optional)</span></label>
                <textarea id="svc-hire-msg" class="modal-textarea" rows="3"
                    placeholder="Describe what you need help with…"></textarea>
            </div>

            <div class="modal-action-row">
                <button class="svc-btn svc-btn-hire" onclick="SVC._submitHire(${helperId}, ${profileId})">
                    Send Hire Request
                </button>
                <button class="svc-btn svc-btn-outline" onclick="this.closest('.svc-overlay').remove()">Cancel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#svc-hire-date')?.focus();
        bindModalClose(overlay);
    }

    async function _submitHire(helperId, profileId) {
        const startDate = document.getElementById('svc-hire-date')?.value;
        const duration  = document.getElementById('svc-hire-duration')?.value?.trim();
        const message   = document.getElementById('svc-hire-msg')?.value?.trim();

        if (!startDate) { showNotification('Please select a start date.', 'error'); return; }

        try {
            const res  = await fetch(`${API}/api/hire-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN()}` },
                body: JSON.stringify({
                    helper_id:  +helperId,
                    profile_id: profileId ? +profileId : null,
                    start_date: startDate,
                    duration:   duration || 'To be discussed',
                    message:    message  || ''
                })
            });
            const data = await res.json();
            if (data.success) {
                document.querySelector('.svc-overlay')?.remove();
                showNotification('Hire request sent! They\'ll be in touch soon. ✓', 'success');
            } else {
                showNotification(data.error || 'Failed to send request.', 'error');
            }
        } catch {
            showNotification('Network error. Please try again.', 'error');
        }
    }

    /* ═══════════════════════════════════════════
       BOOKMARK
    ═══════════════════════════════════════════ */
    async function toggleBookmark(btn, profileId) {
        if (!isLoggedIn()) { promptLogin(); return; }

        try {
            const res  = await fetch(`${API}/api/profiles/${profileId}/save`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${TOKEN()}` }
            });
            const data = await res.json();
            if (data.success) {
                if (data.saved) {
                    savedIds.add(+profileId);
                    btn.innerHTML   = '★';
                    btn.classList.add('bookmarked');
                    showNotification('Bookmarked! ★', 'success');
                } else {
                    savedIds.delete(+profileId);
                    btn.innerHTML   = '☆';
                    btn.classList.remove('bookmarked');
                    showNotification('Bookmark removed.', 'info');
                }
            }
        } catch {
            showNotification('Could not update bookmark.', 'error');
        }
    }

    /* ═══════════════════════════════════════════
       LOGIN PROMPT MODAL
    ═══════════════════════════════════════════ */
    function promptLogin() {
        // Don't stack prompts
        if (document.querySelector('.svc-login-prompt')) return;

        const overlay = createOverlay('svc-login-prompt');
        overlay.innerHTML = `
        <div class="svc-modal svc-modal-sm svc-modal-center">
            <div class="prompt-icon">🔒</div>
            <h3 class="modal-form-title">Login Required</h3>
            <p class="modal-form-sub">Create a free account or log in to message helpers, send hire requests, view rates and AI interview scores.</p>
            <div class="modal-action-row modal-action-col">
                <a href="login.html" class="svc-btn svc-btn-primary">Login to my account</a>
                <a href="account.html" class="svc-btn svc-btn-outline">Create free account</a>
                <button class="svc-btn svc-btn-ghost" onclick="this.closest('.svc-overlay').remove()">Maybe later</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        bindModalClose(overlay);
    }

    /* ═══════════════════════════════════════════
       UI STATE HELPERS
    ═══════════════════════════════════════════ */
    function showLoading() {
        const grid = document.getElementById('profilesGrid');
        if (grid) {
            grid.innerHTML = `
            <div class="svc-state-card loading-state-card">
                <div class="state-spinner"></div>
                <p class="state-msg">Finding the best professionals for you…</p>
            </div>`;
        }
    }

    function showEmpty() {
        const grid = document.getElementById('profilesGrid');
        if (!grid) return;
        hideStates();
        grid.innerHTML = `
        <div class="svc-state-card">
            <div class="state-icon">🔍</div>
            <p class="state-title">No professionals found</p>
            <p class="state-msg">Try clearing your filters or broadening your search.</p>
            <button class="svc-btn svc-btn-outline" onclick="SVC.clearAllFilters()">Clear filters</button>
        </div>`;
    }

    function showError(msg) {
        const grid = document.getElementById('profilesGrid');
        if (!grid) return;
        hideStates();
        grid.innerHTML = `
        <div class="svc-state-card">
            <div class="state-icon">⚠️</div>
            <p class="state-title">Something went wrong</p>
            <p class="state-msg">${esc(msg)}</p>
            <button class="svc-btn svc-btn-outline" onclick="location.reload()">Try again</button>
        </div>`;
    }

    function hideStates() {
        // hide any legacy state elements from the HTML
        ['loadingSpinner','errorMessage','noResults'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function updateResultsMeta(count) {
        const el = document.getElementById('resultsCount');
        if (el) el.textContent = `${count} professional${count !== 1 ? 's' : ''} found`;
        const clearBtn = document.getElementById('clearFilters');
        if (clearBtn) clearBtn.style.display = (searchTerm || activeChip !== 'all') ? '' : 'none';
    }

    /* ═══════════════════════════════════════════
       NOTIFICATION TOAST
    ═══════════════════════════════════════════ */
    function showNotification(msg, type = 'success') {
        const colors = { success: '#00938a', error: '#e53e3e', info: '#3b82f6' };
        const toast  = document.createElement('div');
        toast.className = 'svc-toast';
        toast.textContent = msg;
        toast.style.cssText = `
            position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
            background:${colors[type] || colors.success}; color:#fff;
            padding:0.85rem 1.4rem; border-radius:10px;
            font-family:var(--font-body); font-size:0.9rem; font-weight:500;
            box-shadow:0 8px 24px rgba(0,0,0,0.18);
            animation:toastIn 0.3s var(--ease,ease) both;
            max-width:320px; line-height:1.4;`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.25s ease forwards';
            setTimeout(() => toast.remove(), 260);
        }, 3200);
    }

    /* ═══════════════════════════════════════════
       UTILITIES
    ═══════════════════════════════════════════ */
    function createOverlay(extraClass = '') {
        const el = document.createElement('div');
        el.className = `svc-overlay${extraClass ? ' ' + extraClass : ''}`;
        return el;
    }

    function bindModalClose(overlay) {
        // Click outside to close
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        // Escape key
        const onKey = e => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
    }

    function trapFocus(el) {
        const focusable = el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) focusable[0].focus();
    }

    function clampRating(raw) {
        const r = parseFloat(raw) || 4.0;
        return Math.min(5, Math.max(0, r));
    }

    function buildStars(rating) {
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5;
        const empty = 5 - full - (half ? 1 : 0);
        return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
    }

    function getInitials(name = '') {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
    }

    function serviceLabel(type) {
        return { nurses: 'Elderly Care Specialist', nannies: 'Nanny', cleaners: 'Cleaner' }[type] || 'Professional';
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    /* ═══════════════════════════════════════════
       PUBLIC API  (window.SVC)
    ═══════════════════════════════════════════ */
    window.SVC = {
        openProfile:    openProfile,
        openMessage:    openMessage,
        openHire:       openHire,
        toggleBookmark: toggleBookmark,
        promptLogin:    promptLogin,
        clearAllFilters: clearAllFilters,
        // expose internal send/submit so inline onclick can reach them
        _sendMessage:   _sendMessage,
        _submitHire:    _submitHire,
        // expose for legacy elderlyCare.js compatibility
        filterProfiles: (term) => { searchTerm = term; applyFilters(); },
        filterByType:   (chip) => { activeChip = chip; applyFilters(); },
    };

    // Legacy compatibility — expose globally so old HTML filter chips still work
    window.filterProfiles = window.SVC.filterProfiles;
    window.filterByType   = window.SVC.filterByType;

})();