/**
 * messaging.js - Complete two-way messaging system
 */

const API_BASE_URL = 'http://localhost:3000';
let currentUser = null;
let conversations = [];
let currentConversation = null;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Load conversations
    await loadConversations();
    
    // Start polling for new messages
    startPolling();
});

function setupEventListeners() {
    const sendBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

async function loadConversations() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            conversations = data.conversations;
            displayConversations();
        }
    } catch (error) {
        console.error('Load conversations error:', error);
        const container = document.getElementById('conversationsList');
        if (container) {
            container.innerHTML = '<div class="empty-state">Error loading conversations</div>';
        }
    }
}

function displayConversations() {
    const container = document.getElementById('conversationsList');
    if (!container) return;
    
    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">No messages yet</div>
                <div class="empty-message">When you message someone, they'll appear here</div>
                ${currentUser.user_role === 'hirer' ? 
                    '<a href="browse.html" class="btn-primary" style="margin-top: 1rem;">Browse Helpers</a>' : 
                    '<a href="profile.html" class="btn-primary" style="margin-top: 1rem;">Complete Your Profile</a>'
                }
            </div>
        `;
        return;
    }
    
    container.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${currentConversation?.user_id === conv.user_id ? 'active' : ''}" 
             data-user-id="${conv.user_id}" 
             data-user-name="${escapeHtml(conv.user_name)}"
             data-user-role="${conv.user_role}"
             onclick="selectConversation(${conv.user_id}, '${escapeHtml(conv.user_name)}', '${conv.user_role}')">
            <div class="conversation-avatar">${conv.user_name.charAt(0).toUpperCase()}</div>
            <div class="conversation-details">
                <div class="conversation-name">
                    <span>${escapeHtml(conv.user_name)}</span>
                    <span class="conversation-time">${conv.last_message_time ? formatTime(conv.last_message_time) : ''}</span>
                </div>
                <div class="conversation-last">
                    ${conv.last_message ? escapeHtml(conv.last_message.substring(0, 50)) + (conv.last_message.length > 50 ? '...' : '') : 'No messages yet'}
                </div>
            </div>
            ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
        </div>
    `).join('');
}

async function selectConversation(userId, userName, userRole) {
    currentConversation = { user_id: userId, user_name: userName, user_role: userRole };
    
    // Update active state in sidebar
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId == userId) {
            item.classList.add('active');
        }
    });
    
    // Update chat header
    const chatHeader = document.getElementById('chatHeader');
    if (chatHeader) {
        chatHeader.innerHTML = `
            <div class="chat-user-info">
                <div class="chat-user-avatar">${userName.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="chat-user-name">${escapeHtml(userName)}</div>
                    <div class="chat-user-role">${userRole === 'helper' ? '🧑‍🔧 Helper' : '👔 Hirer'}</div>
                </div>
            </div>
            <button class="btn-secondary" onclick="viewProfile(${userId})" style="padding: 0.4rem 0.8rem;">View Profile</button>
        `;
    }
    
    // Show input area
    const chatInputArea = document.getElementById('chatInputArea');
    if (chatInputArea) chatInputArea.style.display = 'flex';
    
    // Load messages
    await loadMessages(userId);
}

async function loadMessages(userId) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '<div class="loading-messages"><div class="spinner"></div><p>Loading messages...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            displayMessages(data.messages);
            // Refresh conversation list to update unread counts
            loadConversations();
        }
    } catch (error) {
        console.error('Load messages error:', error);
        chatMessages.innerHTML = '<div class="empty-state">Error loading messages</div>';
    }
}

function displayMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    if (!messages || messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">No messages yet</div>
                <div class="empty-message">Send a message to start the conversation!</div>
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = messages.map(msg => `
        <div class="message ${msg.sender_id == currentUser.id ? 'sent' : 'received'}">
            <div class="message-bubble">
                ${escapeHtml(msg.message)}
                <div class="message-time">
                    ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    ${msg.sender_id == currentUser.id && msg.is_read ? '<span class="message-status">✓✓</span>' : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim();
    
    if (!message || !currentConversation) return;
    
    // Clear input and disable button
    messageInput.value = '';
    const sendBtn = document.getElementById('sendMessageBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                receiver_id: currentConversation.user_id,
                profile_id: null,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Reload messages to show the new one
            await loadMessages(currentConversation.user_id);
            // Refresh conversation list to update last message
            await loadConversations();
            
            // Scroll to bottom
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            showNotification(data.error || 'Failed to send message', 'error');
            messageInput.value = message; // Restore message
        }
    } catch (error) {
        console.error('Send message error:', error);
        showNotification('Network error - please try again', 'error');
        messageInput.value = message; // Restore message
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
        messageInput.focus();
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        // Refresh conversations list
        await loadConversations();
        
        // If a conversation is open, refresh messages
        if (currentConversation) {
            await loadMessages(currentConversation.user_id);
        }
    }, 5000); // Poll every 5 seconds
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 24 * 60 * 60 * 1000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

function viewProfile(userId) {
    window.location.href = `profile.html?id=${userId}`;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: 'DM Sans', sans-serif;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global functions for onclick
window.selectConversation = selectConversation;
window.viewProfile = viewProfile;