/**
 * enhanced-hire-modal.js
 * Enhanced hire modal with calendar day selection and per-day hour sliders
 */

(function() {
    'use strict';
    
    // Store current hire state
    const state = {
        helperId: null,
        profileId: null,
        helperName: '',
        hourlyRate: 200,
        selectedDates: [],
        perDayHours: {},
        totalHours: 0,
        totalAmount: 0,
        updateTimer: null
    };
    
    // Helper: escape HTML to prevent XSS attacks
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Helper: Get tomorrow's date in YYYY-MM-DD format (for start date default)
    function getTomorrowDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }
    
    // Generate calendar HTML for the next 14 days
    function generateCalendarHTML() {
        const today = new Date();
        const dates = [];
        
        // Generate next 14 days
        for (let i = 0; i < 14; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date);
        }
        
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; margin-bottom: 1rem;">';
        
        // Add weekday headers
        weekdays.forEach(day => {
            html += `<div style="text-align: center; font-weight: 600; font-size: 0.8rem; padding: 0.5rem;">${day}</div>`;
        });
        
        const firstDate = dates[0];
        const startOffset = firstDate.getDay();
        
        // Add empty cells for offset
        for (let i = 0; i < startOffset; i++) {
            html += '<div></div>';
        }
        
        // Add date cells
        dates.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];
            const dayNum = date.getDate();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isSelected = state.selectedDates.includes(dateStr);
            
            html += `
                <div class="hire-calendar-date ${isSelected ? 'selected' : ''}" 
                     data-date="${dateStr}"
                     style="
                         text-align: center;
                         padding: 0.75rem 0.5rem;
                         border: 1px solid ${isSelected ? '#00938a' : '#ddd'};
                         border-radius: 8px;
                         cursor: pointer;
                         background: ${isSelected ? '#e6f4f2' : (isWeekend ? '#fff8f0' : 'white')};
                         transition: all 0.2s;
                     "
                     onclick="window.EnhancedHire.toggleDate('${dateStr}')">
                    <div style="font-weight: 600;">${dayNum}</div>
                    <div style="font-size: 0.7rem; color: ${isWeekend ? '#e67e22' : '#999'}">${weekdays[date.getDay()]}</div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    // Generate hour sliders for each selected date
    function generateHourSliders() {
        if (state.selectedDates.length === 0) {
            return '<div style="text-align: center; padding: 2rem; color: #999;">Select dates above to set hours per day</div>';
        }
        
        let html = '<div style="max-height: 300px; overflow-y: auto;">';
        
        state.selectedDates.forEach(dateStr => {
            const date = new Date(dateStr);
            const formattedDate = date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });
            const hours = state.perDayHours[dateStr] || 0;
            
            html += `
                <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; margin-bottom: 0.5rem; background: #f9f9f9; border-radius: 8px;">
                    <div style="width: 100px; font-size: 0.85rem; font-weight: 500;">${formattedDate}</div>
                    <input type="range" class="hour-slider" data-date="${dateStr}" min="0" max="12" step="0.5" value="${hours}" 
                           style="flex: 1;" oninput="window.EnhancedHire.updateHourSlider(this)">
                    <input type="number" class="hour-input" data-date="${dateStr}" min="0" max="12" step="0.5" value="${hours}" 
                           style="width: 70px; text-align: center;" oninput="window.EnhancedHire.updateHourInput(this)">
                    <span>hours</span>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    // Update total amount calculation based on selected hours
    function updateTotal() {
        let totalHours = 0;
        
        for (const dateStr of state.selectedDates) {
            totalHours += state.perDayHours[dateStr] || 0;
        }
        
        const totalAmount = totalHours * state.hourlyRate;
        state.totalHours = totalHours;
        state.totalAmount = totalAmount;
        
        const totalDisplay = document.getElementById('hireTotalDisplay');
        const hoursDisplay = document.getElementById('hireHoursDisplay');
        const calcDisplay = document.getElementById('hireCalcDisplay');
        
        if (totalDisplay) totalDisplay.innerHTML = `R${totalAmount.toFixed(2)}`;
        if (hoursDisplay) hoursDisplay.innerHTML = `${totalHours.toFixed(1)} hours`;
        if (calcDisplay) {
            calcDisplay.innerHTML = `${totalHours.toFixed(1)} hours × R${state.hourlyRate}/hour = R${totalAmount.toFixed(2)}`;
        }
    }
    
    // Debounced update to prevent too many calculations
    function debouncedUpdate() {
        if (state.updateTimer) clearTimeout(state.updateTimer);
        state.updateTimer = setTimeout(() => updateTotal(), 100);
    }
    
    // Fetch helper's hourly rate from the server
    async function fetchHelperRate(profileId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:3000/api/profiles/${profileId}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await response.json();
            
            if (data.success && data.profile) {
                const rate = parseFloat(data.profile.hourly_rate || data.profile.rate || 200);
                state.hourlyRate = rate;
            }
        } catch (err) {
            console.warn('Could not fetch rate, using default:', err);
        }
    }
    
    // Open the enhanced hire modal
    async function openModal(helperId, profileId, helperName) {
        // Show loading modal first
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'svc-overlay';
        loadingOverlay.innerHTML = `
            <div class="svc-modal svc-modal-sm svc-modal-center">
                <div class="modal-spinner"></div>
                <p>Loading...</p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
        
        // Fetch helper's rate
        await fetchHelperRate(profileId);
        
        // Reset state
        state.helperId = helperId;
        state.profileId = profileId;
        state.helperName = helperName;
        state.selectedDates = [];
        state.perDayHours = {};
        state.totalHours = 0;
        state.totalAmount = 0;
        
        // Remove loading overlay
        loadingOverlay.remove();
        
        // Remove any existing modal
        const existing = document.querySelector('.svc-overlay:not(.loading)');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.className = 'svc-overlay';
        
        overlay.innerHTML = `
            <div class="svc-modal" style="max-width: 750px; max-height: 90vh; overflow-y: auto;">
                <button class="modal-close-btn" onclick="this.closest('.svc-overlay').remove()" style="position: absolute; right: 1rem; top: 1rem; background: none; border: none; font-size: 1.5rem; cursor: pointer;">✕</button>
                
                <h3 class="modal-form-title">Hire ${escapeHtml(state.helperName)}</h3>
                <p class="modal-form-sub">Rate: <strong>R${state.hourlyRate}/hour</strong></p>
                
                <!-- Mode Tabs -->
                <div style="display: flex; gap: 0.5rem; margin: 1rem 0; border-bottom: 1px solid #ddd;">
                    <button class="hire-mode-tab active" data-mode="simple" onclick="window.EnhancedHire.switchMode('simple')" 
                            style="padding: 0.5rem 1rem; background: none; border: none; cursor: pointer; font-weight: 500;">Simple</button>
                    <button class="hire-mode-tab" data-mode="detailed" onclick="window.EnhancedHire.switchMode('detailed')" 
                            style="padding: 0.5rem 1rem; background: none; border: none; cursor: pointer; font-weight: 500;">Detailed Schedule</button>
                </div>
                
                <!-- Simple Mode -->
                <div id="hireSimpleMode" style="display: block;">
                    <div class="modal-field">
                        <label class="modal-label">Start Date <span class="req">*</span></label>
                        <input type="date" id="hireStartDate" class="modal-input" value="${getTomorrowDate()}">
                    </div>
                    <div class="modal-field">
                        <label class="modal-label">Duration / Hours</label>
                        <input type="text" id="hireDuration" class="modal-input" placeholder="e.g. 4 hours · 1 week · ongoing">
                    </div>
                    <div class="modal-field">
                        <label class="modal-label">Message <span class="modal-optional">(optional)</span></label>
                        <textarea id="hireMessage" class="modal-textarea" rows="3" placeholder="Describe what you need help with…"></textarea>
                    </div>
                </div>
                
                <!-- Detailed Mode -->
                <div id="hireDetailedMode" style="display: none;">
                    <div class="modal-field">
                        <label class="modal-label">Select Dates (click to select/unselect)</label>
                        <div id="hireCalendarContainer">${generateCalendarHTML()}</div>
                    </div>
                    
                    <div class="modal-field">
                        <label class="modal-label">Hours Per Day</label>
                        <div id="hireSlidersContainer">${generateHourSliders()}</div>
                    </div>
                </div>
                
                <!-- Total Display -->
                <div style="background: #e6f4f2; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600;">Total Amount:</span>
                        <span id="hireTotalDisplay" style="font-size: 1.5rem; font-weight: 700; color: #00938a;">R0.00</span>
                    </div>
                    <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                        <span id="hireHoursDisplay">0 hours</span>
                        <span id="hireCalcDisplay"></span>
                    </div>
                </div>
                
                <div class="modal-action-row" style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button class="svc-btn svc-btn-hire" onclick="window.EnhancedHire.submit()">Send Hire Request</button>
                    <button class="svc-btn svc-btn-outline" onclick="this.closest('.svc-overlay').remove()">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }
    
    // Switch between simple and detailed mode
    function switchMode(mode) {
        const simpleMode = document.getElementById('hireSimpleMode');
        const detailedMode = document.getElementById('hireDetailedMode');
        const tabs = document.querySelectorAll('.hire-mode-tab');
        
        tabs.forEach(tab => {
            if (tab.dataset.mode === mode) {
                tab.classList.add('active');
                tab.style.color = '#00938a';
                tab.style.borderBottom = '2px solid #00938a';
            } else {
                tab.classList.remove('active');
                tab.style.color = '';
                tab.style.borderBottom = '';
            }
        });
        
        if (mode === 'simple') {
            if (simpleMode) simpleMode.style.display = 'block';
            if (detailedMode) detailedMode.style.display = 'none';
        } else {
            if (simpleMode) simpleMode.style.display = 'none';
            if (detailedMode) detailedMode.style.display = 'block';
        }
    }
    
    // Toggle date selection in calendar
    function toggleDate(dateStr) {
        const index = state.selectedDates.indexOf(dateStr);
        
        if (index === -1) {
            state.selectedDates.push(dateStr);
            state.perDayHours[dateStr] = 0;
        } else {
            state.selectedDates.splice(index, 1);
            delete state.perDayHours[dateStr];
        }
        
        // Update calendar UI
        const dateElements = document.querySelectorAll('.hire-calendar-date');
        dateElements.forEach(el => {
            if (el.dataset.date === dateStr) {
                const isSelected = state.selectedDates.includes(dateStr);
                el.style.background = isSelected ? '#e6f4f2' : '';
                el.style.borderColor = isSelected ? '#00938a' : '#ddd';
                el.classList.toggle('selected', isSelected);
            }
        });
        
        // Regenerate hour sliders
        const slidersContainer = document.getElementById('hireSlidersContainer');
        if (slidersContainer) {
            slidersContainer.innerHTML = generateHourSliders();
        }
        
        updateTotal();
    }
    
    // Update hour from slider input
    function updateHourSlider(slider) {
        const dateStr = slider.dataset.date;
        const value = parseFloat(slider.value);
        state.perDayHours[dateStr] = value;
        
        const input = document.querySelector(`.hour-input[data-date="${dateStr}"]`);
        if (input) input.value = value;
        
        debouncedUpdate();
    }
    
    // Update hour from number input
    function updateHourInput(input) {
        const dateStr = input.dataset.date;
        const value = parseFloat(input.value);
        if (!isNaN(value) && value >= 0 && value <= 12) {
            state.perDayHours[dateStr] = value;
            
            const slider = document.querySelector(`.hour-slider[data-date="${dateStr}"]`);
            if (slider) slider.value = value;
            
            debouncedUpdate();
        }
    }
    
    // Submit hire request to the server
    async function submitHireRequest() {
        const activeTab = document.querySelector('.hire-mode-tab.active');
        const mode = activeTab ? activeTab.dataset.mode : 'simple';
        
        let requestBody = {};
        
        if (mode === 'simple') {
            const startDate = document.getElementById('hireStartDate')?.value;
            const duration = document.getElementById('hireDuration')?.value;
            const message = document.getElementById('hireMessage')?.value;
            
            if (!startDate) {
                alert('Please select a start date');
                return;
            }
            
            requestBody = {
                helper_id: state.helperId,
                profile_id: state.profileId,
                start_date: startDate,
                duration: duration || 'To be discussed',
                message: message || ''
            };
        } else {
            // Detailed mode with schedule
            if (state.selectedDates.length === 0) {
                alert('Please select at least one date');
                return;
            }
            
            const schedule = [];
            let totalHours = 0;
            
            for (const dateStr of state.selectedDates) {
                const hours = state.perDayHours[dateStr] || 0;
                if (hours > 0) {
                    schedule.push({ date: dateStr, hours: hours });
                    totalHours += hours;
                }
            }
            
            if (schedule.length === 0) {
                alert('Please set hours for at least one selected day');
                return;
            }
            
            const totalAmount = totalHours * state.hourlyRate;
            const message = document.getElementById('hireMessage')?.value || '';
            
            requestBody = {
                helper_id: state.helperId,
                profile_id: state.profileId,
                start_date: schedule[0].date,
                duration: `${totalHours} hours over ${schedule.length} day(s)`,
                message: message,
                schedule: schedule,
                total_hours: totalHours,
                total_amount: totalAmount,
                hourly_rate: state.hourlyRate
            };
        }
        
        // Confirm with user
        const confirmMsg = mode === 'simple' 
            ? `Send hire request?\n\nStart: ${requestBody.start_date}\nDuration: ${requestBody.duration}`
            : `Send hire request?\n\nSchedule: ${requestBody.schedule.length} day(s)\nTotal Hours: ${requestBody.total_hours}\nTotal Amount: R${requestBody.total_amount.toFixed(2)}`;
        
        if (!confirm(confirmMsg)) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/hire-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('✅ Hire request sent successfully!');
                document.querySelector('.svc-overlay')?.remove();
                
                // Only show payment popup for the HIRER (not helper)
                const user = JSON.parse(localStorage.getItem('user'));
                if (user && user.user_role === 'hirer' && data.total_amount && data.total_amount > 0) {
                    const payNow = confirm(`Total amount: R${data.total_amount.toFixed(2)}\n\nWould you like to make a payment now?`);
                    if (payNow) {
                        await initiatePayment(data.requestId, data.total_amount);
                    }
                }
            } else {
                alert(data.error || 'Failed to send hire request');
            }
        } catch (error) {
            console.error('Submit error:', error);
            alert('Network error - please try again');
        }
    }
    
    // Initiate PayFast payment
    async function initiatePayment(hireRequestId, amount) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3000/api/payfast/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    amount: amount,
                    item_name: `Hire Request #${hireRequestId}`,
                    item_description: `Payment for hire request ${hireRequestId}`,
                    hire_request_id: hireRequestId
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.formData) {
                // Create and submit form to PayFast
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.payfastUrl;
                form.target = '_blank';
                
                for (const [key, value] of Object.entries(data.formData)) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = value;
                    form.appendChild(input);
                }
                
                document.body.appendChild(form);
                form.submit();
                document.body.removeChild(form);
            } else {
                alert('Payment initialization failed. Please try again.');
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('Payment system error. Please try again later.');
        }
    }
    
    // Export functions to window object for global access
    window.EnhancedHire = {
        open: openModal,
        switchMode: switchMode,
        toggleDate: toggleDate,
        updateHourSlider: updateHourSlider,
        updateHourInput: updateHourInput,
        submit: submitHireRequest,
        initiatePayment: initiatePayment
    };
    
})();