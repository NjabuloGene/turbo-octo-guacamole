// interview-widget.js
let interviewId = null;
const rotator = document.getElementById('rotator');
const answerInput = document.getElementById('answerInput');
const sendBtn = document.getElementById('sendAnswerBtn');
const startBtn = document.getElementById('startInterviewBtn');
const statusEl = document.getElementById('interview-status');

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

async function sendToInterview(answer) {
    try {
        const response = await fetch('/api/interview/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                answer: answer,
                interview_id: interviewId
            })
        });
        const data = await response.json();
        if (data.error) {
            rotator.innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
        } else {
            rotator.innerHTML = data.reply;
            interviewId = data.interview_id;
            statusEl.innerText = ''; // clear any previous status
        }
    } catch (error) {
        console.error('Fetch error:', error);
        rotator.innerHTML = '<p style="color:red;">Network error. Try again.</p>';
    }
}

startBtn.addEventListener('click', () => {
    // Check if user is logged in (optional, but API will enforce)
    sendToInterview('');  // empty answer signals start
    answerInput.disabled = false;
    sendBtn.disabled = false;
    startBtn.disabled = true;  // disable start after first click
});

sendBtn.addEventListener('click', () => {
    const answer = answerInput.value.trim();
    if (answer) {
        sendToInterview(answer);
        answerInput.value = '';
    }
});

answerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendBtn.click();
    }
});

// Initial state
answerInput.disabled = true;
sendBtn.disabled = true;

// Optional: Check login status on page load
fetch('/api/current-user/')
    .then(res => res.json())
    .then(data => {
        if (!data.is_authenticated) {
            statusEl.innerText = 'Please log in to use the interview.';
            startBtn.disabled = true;
        }
    });