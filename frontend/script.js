// Load jobs
fetch("http://127.0.0.1:8000/api/jobs/")
    .then(res => res.json())
    .then(data => {
        let list = document.getElementById("jobList");
        if (!list) return;

        data.forEach(job => {
            let li = document.createElement("li");
            li.textContent = `${job.title} - $${job.budget}`;
            list.appendChild(li);
        });
    });

// AI Interview
function startInterview() {
    fetch("http://127.0.0.1:8000/api/interview/")
        .then(res => res.json())
        .then(data => {
            document.getElementById("result").innerText =
                `Score: ${data.score}\nFeedback: ${data.feedback}`;
        });
}
