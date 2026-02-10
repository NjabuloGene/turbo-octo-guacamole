(function() {
    // 1. Check for HTTPS immediately (Strict 2026 Requirement)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        document.getElementById('error-display').innerText = "FATAL: Camera requires HTTPS. Your current connection is insecure.";
        return;
    }

    const actionBtn = document.getElementById('btn-action');
    const videoElem = document.getElementById('live-stream');
    const errElem = document.getElementById('error-display');

    actionBtn.addEventListener('click', async (event) => {
        // Double-insurance against reloads
        event.preventDefault();
        event.stopPropagation();

        try {
            errElem.innerText = "Requesting camera...";
            
            // 2. Request Stream
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "user" }, 
                audio: true 
            });

            // 3. Attach to Video Element
            videoElem.srcObject = stream;
            errElem.innerText = "Camera active.";
            actionBtn.innerText = "Recording Logic Ready";
            
        } catch (error) {
            // This alert stops the "silent reload" so you can read the error
            console.error("Camera System Error:", error);
            alert("Error accessing camera: " + error.name + " - " + error.message);
            errElem.innerText = "Error: " + error.message;
        }
    });
})();


const htmlSnippets = [
    `<h2>Introduce yourself</h2><p>Are you trustworthy.</p>`,
    `<h2>Why should you be hired</h2><p>What is your biggest challenge</p>`,
    `<h2>Have you ever leaked confidential information</h2><p>Are you right for the role?</p>`
  ];

  let index = 0;
  const rotator = document.getElementById("rotator");

  function rotateContent() {
    rotator.innerHTML = htmlSnippets[index];
    index = (index + 1) % htmlSnippets.length;
  }

  rotateContent(); // initial load
  setInterval(rotateContent, 7000); 