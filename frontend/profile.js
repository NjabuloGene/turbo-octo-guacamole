// Wait for the DOM to be fully loaded before accessing elements
document.addEventListener('DOMContentLoaded', () => {
  // ========== ELEMENT REFERENCES WITH SAFE CHECKS ==========
  const video = document.getElementById('live-stream');
  const btnAction = document.getElementById('btn-action');
  const errorDisplay = document.getElementById('error-display');
  const idFileInput = document.getElementById('idBook');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const verificationStatus = document.getElementById('verificationStatus');
  const verificationResult = document.getElementById('verificationResult');
  const cameraContainer = document.querySelector('.video-container');
  
  const startInterviewBtn = document.getElementById('startInterviewBtn');
  
  // Try to find the question display element - check common IDs
  let rotatorInterview = 
    document.getElementById('rotator-interview') || 
    document.getElementById('rotator') ||
    document.getElementById('questionDisplay');
  
  const answerInput = document.getElementById('answerInput');
  const sendAnswerBtn = document.getElementById('sendAnswerBtn');
  const voiceRecordBtn = document.getElementById('voiceRecordBtn');
  const recordingStatus = document.getElementById('recordingStatus');
  
  // Logout elements
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameElement = document.getElementById('userName');
  const userEmailElement = document.getElementById('userEmail');

  // ========== INTERVIEW STATE ==========
  let currentQuestions = [];
  let currentQuestionIndex = 0;
  let interviewSessionId = null;
  let totalScore = 0;
  let answeredQuestions = 0;
  let interviewResults = []; // Store all answers for admin view

  console.log('🔍 Element check:', {
    rotatorInterview: rotatorInterview,
    answerInput: answerInput,
    sendAnswerBtn: sendAnswerBtn,
    voiceRecordBtn: voiceRecordBtn
  });

  // ========== AUTH CHECK ==========
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  
  // Redirect to login if not authenticated
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  
  // ========== ROLE-BASED ACCESS CONTROL ==========
  /**
   * Profile page is only for helpers (people looking for work)
   * If a hirer tries to access this page, redirect them to browse page
   */
  if (user && user.user_role !== 'helper') {
    alert('This page is only for helpers looking for work. Redirecting you to browse professionals.');
    window.location.href = 'browse.html';
    return;
  }
  
  // Display user info if elements exist
  if (user) {
    if (userNameElement) userNameElement.textContent = user.name;
    if (userEmailElement) userEmailElement.textContent = user.email;
    
    // Optional: Show role badge
    const roleBadge = document.getElementById('userRoleBadge');
    if (roleBadge) {
      roleBadge.textContent = user.user_role === 'helper' ? '🧑‍🔧 Helper' : '👔 Hirer';
      roleBadge.style.display = 'inline-block';
    }
  }
  
  // ========== LOGOUT ==========
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    });
  }

  // ========== SPEECH RECOGNITION (VOICE TO TEXT) ==========
  let recognition = null;
  let isRecording = false;

  /**
   * Initialize speech recognition for voice-to-text functionality
   * Uses browser's built-in Web Speech API (completely free)
   */
  function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.log('Speech recognition not supported');
      if (voiceRecordBtn) {
        voiceRecordBtn.disabled = true;
        voiceRecordBtn.title = 'Speech recognition not supported in this browser';
      }
      return false;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      
      if (answerInput) answerInput.value = transcript;
      
      if (event.results[0].isFinal) {
        if (recordingStatus) {
          recordingStatus.textContent = '✓ Voice captured!';
          recordingStatus.style.color = '#00a098';
        }
        if (voiceRecordBtn) {
          voiceRecordBtn.classList.remove('recording');
          voiceRecordBtn.innerHTML = '<span class="btn-icon">🎤</span> Record Voice';
        }
        isRecording = false;
      }
    };
    
    recognition.onend = () => {
      if (isRecording) {
        if (voiceRecordBtn) {
          voiceRecordBtn.classList.remove('recording');
          voiceRecordBtn.innerHTML = '<span class="btn-icon">🎤</span> Record Voice';
        }
        if (recordingStatus) {
          recordingStatus.textContent = '';
        }
        isRecording = false;
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (recordingStatus) {
        recordingStatus.textContent = `Error: ${event.error}`;
        recordingStatus.style.color = '#dc3545';
      }
      
      if (voiceRecordBtn) {
        voiceRecordBtn.classList.remove('recording');
        voiceRecordBtn.innerHTML = '<span class="btn-icon">🎤</span> Record Voice';
      }
      isRecording = false;
    };
    
    return true;
  }

  // ========== VOICE RECORDING BUTTON ==========
  if (voiceRecordBtn) {
    voiceRecordBtn.disabled = true; // Initially disabled
    
    voiceRecordBtn.addEventListener('click', () => {
      if (!recognition) {
        const supported = initSpeechRecognition();
        if (!supported) {
          alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
          return;
        }
      }
      
      if (!isRecording) {
        try {
          recognition.start();
          isRecording = true;
          voiceRecordBtn.classList.add('recording');
          voiceRecordBtn.innerHTML = '<span class="btn-icon">⏹️</span> Stop Recording';
          if (recordingStatus) {
            recordingStatus.textContent = '🔴 Listening...';
            recordingStatus.style.color = '#dc3545';
          }
        } catch (error) {
          console.error('Failed to start recording:', error);
        }
      } else {
        recognition.stop();
        isRecording = false;
        voiceRecordBtn.classList.remove('recording');
        voiceRecordBtn.innerHTML = '<span class="btn-icon">🎤</span> Record Voice';
        if (recordingStatus) {
          recordingStatus.textContent = '✓ Stopped';
          setTimeout(() => {
            recordingStatus.textContent = '';
          }, 2000);
        }
      }
    });
  }

  // ========== CAMERA ==========
  let cameraStream = null;
  
  /**
   * Initialize camera for identity verification
   * Requests user permission and starts video stream
   */
  async function startCamera() {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user" 
        }, 
        audio: false 
      });
      
      if (video) {
        video.srcObject = cameraStream;
        video.style.display = 'block';
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });
      }
      
      if (cameraPlaceholder) {
        cameraPlaceholder.style.display = 'none';
      }
      
      if (errorDisplay) {
        errorDisplay.textContent = 'Camera ready.';
      }
      console.log('Camera started successfully');
    } catch (err) {
      if (errorDisplay) {
        errorDisplay.textContent = 'Camera access denied or not available.';
      }
      console.error('Camera error:', err);
    }
  }
  
  if (video) {
    startCamera();
  }

  // ========== IDENTITY VERIFICATION ==========
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

      if (errorDisplay) {
        errorDisplay.textContent = 'Capturing photo...';
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isBlack = Array.from(imageData.data).every(val => val === 0);
      
      if (isBlack) {
        console.error('Captured black image, retrying...');
        alert('Camera captured a black image. Please ensure good lighting and try again.');
        if (errorDisplay) {
          errorDisplay.textContent = 'Camera ready.';
        }
        return;
      }

      const livePhotoBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const livePhotoFile = new File([livePhotoBlob], 'live-photo.jpg', { type: 'image/jpeg' });

      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
      }
      
      if (video) {
        video.style.display = 'none';
      }
      
      if (cameraContainer) {
        cameraContainer.innerHTML = '<div class="verification-processing"><span>⏳</span> Verifying identity...</div>';
      }

      const formData = new FormData();
      formData.append('livePhoto', livePhotoFile);
      formData.append('idPhoto', idFileInput.files[0]);

      btnAction.disabled = true;
      btnAction.textContent = 'Verifying...';

      try {
        const token = localStorage.getItem('token');
        
        const response = await fetch('http://localhost:3000/api/verify-identity', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Verification response:', data);

        if (data.success) {
          const matchScore = data.verification.matchScore || 0;
          const isSame = data.verification.isSamePerson;
          
          if (verificationResult) {
            if (isSame && matchScore > 70) {
              verificationResult.innerHTML = `
                <div class="verification-success">
                  <span class="result-icon">✅</span>
                  <div class="result-text">
                    <strong>Identity Verified!</strong>
                    <p>Match Score: ${matchScore}%</p>
                    <small>${data.verification.explanation || 'Successfully verified'}</small>
                  </div>
                </div>
              `;
            } else {
              verificationResult.innerHTML = `
                <div class="verification-failed">
                  <span class="result-icon">❌</span>
                  <div class="result-text">
                    <strong>Verification Failed</strong>
                    <p>Score: ${matchScore}%</p>
                    <small>${data.verification.explanation || 'Could not verify identity'}</small>
                  </div>
                </div>
              `;
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
        btnAction.disabled = false;
        btnAction.textContent = 'Start Verification';
        
        if (video && !cameraStream) {
          startCamera();
        }
      }
    });
  }

  // ========== INTERVIEW START WITH LOGIN CHECK ==========
  /**
   * Checks if user is logged in before starting interview
   * If not logged in, saves progress and redirects to login
   */
  startInterviewBtn.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      // Save current form data to sessionStorage for resume after login
      const currentFormData = {
        role: role,
        skills: skills,
        serviceType: serviceType,
        timestamp: new Date().toISOString()
      };
      sessionStorage.setItem('pendingInterview', JSON.stringify(currentFormData));
      
      // Redirect to login with return URL
      window.location.href = `login.html?redirect=interview&service=${serviceType}`;
      return;
    }
    
    // Rest of your interview start code...
  });

  // ========== AI INTERVIEW ==========
  const serviceSelect = document.getElementById('profileService');
  let serviceType = 'nannies';
  if (serviceSelect) {
    serviceType = serviceSelect.value;
  }

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

  if (startInterviewBtn) {
    startInterviewBtn.addEventListener('click', async () => {
      startInterviewBtn.disabled = true;
      startInterviewBtn.textContent = 'Loading questions...';
      
      // Reset interview state
      currentQuestions = [];
      currentQuestionIndex = 0;
      totalScore = 0;
      answeredQuestions = 0;
      interviewResults = [];

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
          interviewSessionId = data.sessionId;
          
          if (!rotatorInterview) {
            console.error('❌ Question display element not found! Creating one...');
            const newDiv = document.createElement('div');
            newDiv.id = 'rotator-interview';
            newDiv.className = 'question-card';
            document.querySelector('.interview-container')?.appendChild(newDiv);
            rotatorInterview = newDiv;
          }
          
          showNextQuestion();
          if (answerInput) answerInput.disabled = false;
          if (sendAnswerBtn) sendAnswerBtn.disabled = false;
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
        startInterviewBtn.textContent = 'Start AI Interview';
      }
    });
  }

  /**
   * Displays the current question and updates the UI
   * When interview completes, calculates and saves final score
   */
  function showNextQuestion() {
    if (!rotatorInterview) {
      console.error('❌ Cannot show question - rotator element not found');
      return;
    }
    
    if (currentQuestions && currentQuestions.length > 0 && currentQuestionIndex < currentQuestions.length) {
      const q = currentQuestions[currentQuestionIndex];
      rotatorInterview.innerHTML = `
        <div class="question-number">Question ${currentQuestionIndex + 1} of ${currentQuestions.length}</div>
        <div class="question-text">${q.question}</div>
      `;
      if (answerInput) {
        answerInput.value = '';
        answerInput.focus();
      }
      console.log('✅ Question displayed:', q.question.substring(0, 50) + '...');
    } else {
      // Interview completed - calculate average score
      const averageScore = answeredQuestions > 0 ? Math.round(totalScore / answeredQuestions) : 0;
      
      /**
       * Save interview results to database for admin review
       * Stores all answers, scores, and feedback
       */
      async function saveInterviewResults() {
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
          
          if (response.ok) {
            console.log('✅ Interview results saved to database');
          } else {
            console.error('Failed to save results');
          }
        } catch (err) {
          console.error('Error saving results:', err);
        }
      }
      
      // Call the save function
      saveInterviewResults();
      
      // Show completion message with final score
      rotatorInterview.innerHTML = `
        <div class="completion-message">
          <span class="completion-icon">🎉</span>
          <h3>Interview Completed!</h3>
          <div class="final-score">
            <span class="score-label">Your Score:</span>
            <span class="score-value">${averageScore}%</span>
          </div>
          <p class="score-message">Thank you for completing the interview.</p>
        </div>
      `;
      
      console.log('Interview results:', {
        sessionId: interviewSessionId,
        totalScore: averageScore,
        answers: interviewResults
      });
      
      if (sendAnswerBtn) sendAnswerBtn.disabled = true;
      if (answerInput) answerInput.disabled = true;
      if (voiceRecordBtn) voiceRecordBtn.disabled = true;
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
      sendAnswerBtn.textContent = 'Saving...';

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
          
          // Move to next question
          currentQuestionIndex++;
          showNextQuestion();
        } else {
          alert('Error saving answer: ' + (data.error || 'Unknown error'));
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

  if (answerInput) {
    answerInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && sendAnswerBtn && !sendAnswerBtn.disabled) {
        sendAnswerBtn.click();
      }
    });
  }

  // Initially disable interview controls
  if (answerInput) answerInput.disabled = true;
  if (sendAnswerBtn) sendAnswerBtn.disabled = true;
  if (voiceRecordBtn) voiceRecordBtn.disabled = true;
});