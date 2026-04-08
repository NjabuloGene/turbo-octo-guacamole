/**
 * messages.js - Complete messaging system
 */

const API_BASE_URL = 'http://localhost:3000';
let currentUser = null;
let conversations = [];
let currentConversation = null;
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    currentUser = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    setupEventListeners();
    await loadConversations();
    startPolling();
});

function setupEventListeners() {
    const sendBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
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
        if (container) container.innerHTML = '<div class="empty-state">Error loading conversations</div>';
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
            <div class="conversation-info">
                <div class="conversation-name">
                    <span>${escapeHtml(conv.user_name)}</span>
                    <span class="conversation-time">${formatTime(conv.last_message_time)}</span>
                </div>
                <div class="conversation-last">${escapeHtml(conv.last_message?.substring(0, 50) || 'No messages')}</div>
            </div>
            ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
        </div>
    `).join('');
}

async function selectConversation(userId, userName, userRole) {
    currentConversation = { user_id: userId, user_name: userName, user_role: userRole };
    
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId == userId) item.classList.add('active');
    });
    
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
    
    document.getElementById('chatInputArea').style.display = 'flex';
    await loadMessages(userId);
}

async function loadMessages(userId) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    chatMessages.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading messages...</p></div>';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/api/messages/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            displayMessages(data.messages);
            await loadConversations();
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
                    ${msg.sender_id == currentUser.id && msg.is_read ? ' ✓✓' : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput?.value.trim();
    
    if (!message || !currentConversation) return;
    
    messageInput.value = '';
    const sendBtn = document.getElementById('sendMessageBtn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending...'; }
    
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
            await loadMessages(currentConversation.user_id);
            await loadConversations();
            document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
        } else {
            showNotification(data.error || 'Failed to send message', 'error');
            messageInput.value = message;
        }
    } catch (error) {
        console.error('Send message error:', error);
        showNotification('Network error - please try again', 'error');
        messageInput.value = message;
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
        messageInput.focus();
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        await loadConversations();
        if (currentConversation) await loadMessages(currentConversation.user_id);
    }, 5000);
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 24 * 60 * 60 * 1000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function viewProfile(userId) {
    window.location.href = `profile.html?id=${userId}`;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'svc-toast';
    notification.textContent = message;
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.selectConversation = selectConversation;
window.viewProfile = viewProfile;