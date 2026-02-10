const whyUs = document.getElementById('whyUs')

///function reveal(){
//    whyUs.style.display ='block'
//}

const color = document.getElementById("button")

//function buttonColorChange (){
 //   if color == "none"{
        
//    }
//}

const dark = document.querySelector('.darkMode')

dark.addEventListener('click', (event)=>{
    document.body.style.backgroundColor='#0a0031ff';
    //document.body.style.color='#a6e1f4ff';
})

const reveal = document.querySelector('#whyUs');
reveal.addEventListener('click',(e)=>{
    document.body.style.display='block'
})

const hoverEffect = document.getElementById('introText');
hoverEffect.addEventListener('hover',(e)=>{
    searchArea.style.display='block'
})


    document.addEventListener("DOMContentLoaded", () => {
        let but = document.getElementById("but");
        let video = document.getElementById("vid");
        let mediaDevices = navigator.mediaDevices;
        vid.muted = true;
        but.addEventListener("click", () => {

            // Accessing the user camera and video.
            mediaDevices
                .getUserMedia({
                    video: true,
                    audio: true,
                })
                .then((stream) => {
                    // Changing the source of video to current stream.
                    video.srcObject = stream;
                    video.addEventListener("loadedmetadata", () => {
                        video.play();
                    });
                })
                .catch(alert);
        });
    });


    const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    // Attach the stream to the video element
    video.srcObject = stream;

  } catch (error) {
    console.error("Error accessing camera:", error);
    alert("Could not access the camera. Permission denied or no camera found.");
  }
});
