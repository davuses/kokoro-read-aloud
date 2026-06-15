// Listen for messages from the background script

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "tts_kokoro") {
    const base64Audio = message.audioBase64;

    if (base64Audio) {
      // Convert the base64 string back to a Blob
      const byteCharacters = atob(base64Audio); // Decode base64
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
        const slice = byteCharacters.slice(offset, offset + 1024);
        const byteNumbers = new Array(slice.length);

        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }

      const audioBlob = new Blob(byteArrays, { type: "audio/mp3" });
      const audioURL = URL.createObjectURL(audioBlob);
      createAudioPlayer(audioURL);
    } else {
      console.error("No audio data received");
    }
  } else if (message.action === "tts_google_translate") {
    const text = message.text;
    const audioURL = `https://www.google.com/speech-api/v1/synthesize?text=${text}&enc=mpeg&lang=en-us&speed=0.45&client=lr-language-tts&use_google_only_voices=1`;
    createAudioPlayer(audioURL, true);
  } else if (message.action === "getSelectedText") {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
      sendResponse({ success: true, text: selectedText });
    }
  }
});

function createAudioPlayer(audioURL, isGoogleTranslate) {
  // Create or reuse the Clear All button

  let clearAllButton = document.querySelector("#clear-all-audio-button");
  if (!clearAllButton) {
    clearAllButton = document.createElement("button");
    clearAllButton.id = "clear-all-audio-button";
    clearAllButton.textContent = "🧹";
    clearAllButton.style.position = "fixed";
    clearAllButton.style.bottom = "6px";
    clearAllButton.style.right = "470px";
    clearAllButton.style.padding = "7px";
    clearAllButton.style.backgroundColor = "rgb(196 59 59 / 16%)";
    clearAllButton.style.color = "white";
    clearAllButton.style.border = "none";
    clearAllButton.style.borderRadius = "26px";
    clearAllButton.style.cursor = "pointer";
    clearAllButton.style.zIndex = "10000";
    clearAllButton.style.fontSize = "22px";

    clearAllButton.addEventListener("click", () => {
      document
        .querySelectorAll(".audio-player-container")
        .forEach((el) => el.remove());
      clearAllButton.style.display = "none";
    });

    document.body.appendChild(clearAllButton);
  }

  // Show the button if hidden
  clearAllButton.style.display = "block";

  // Create a container div for the new audio player
  const audioContainer = document.createElement("div");
  audioContainer.classList.add("audio-player-container");

  // Create the audio element
  const audioElement = document.createElement("audio");
  audioElement.src = audioURL;
  audioElement.controls = true; // Show controls (play/pause)
  const isMediaPlaying = Array.from(
    document.querySelectorAll("audio, video")
  ).some((el) => !el.paused && !el.ended && el.readyState > 2);

  // Set autoplay to false if other media is playing
  audioElement.autoplay = !isMediaPlaying;

  audioElement.style.height = "38px";

  if (!isGoogleTranslate) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audioElement);
    const gainNode = audioCtx.createGain();
    chrome.storage.sync.get(["volumeBoostIndex"], (result) => {
      const gainLevels = [1.0, 1.25, 1.5, 1.75, 2.0];
      const boost = gainLevels[result.volumeBoostIndex ?? 0]; // default = 100%
      gainNode.gain.value = boost;
    });
    source.connect(gainNode).connect(audioCtx.destination);
  }
  // Create the delay play button
  const delayPlayButton = document.createElement("button");
  delayPlayButton.textContent = "▶ Delay";
  delayPlayButton.style.marginRight = "8px";
  delayPlayButton.style.padding = "4px 10px";
  delayPlayButton.style.border = "none";
  delayPlayButton.style.backgroundColor = "#3498db";
  delayPlayButton.style.color = "white";
  delayPlayButton.style.borderRadius = "6px";
  delayPlayButton.style.cursor = "pointer";
  delayPlayButton.style.fontFamily = "sans-serif";
  delayPlayButton.addEventListener("click", () => {
    delayPlayButton.disabled = true;
    setTimeout(() => {
      if (!isGoogleTranslate) {
        audioCtx.resume(); // required to start audio context
      }
      audioElement.play();
      delayPlayButton.disabled = false;
    }, 2000);
  });

  // Create the close button (X)
  const closeButton = document.createElement("button");
  closeButton.innerHTML = "&times;"; // Use an HTML entity for a "×" symbol
  closeButton.classList.add("close-button");

  // Add an event listener to close the audio player when clicked
  closeButton.addEventListener("click", () => {
    audioContainer.remove(); // Remove the entire audio container (audio + close button)
    adjustAudioPositions(); // Re-adjust positions after removal
  });

  // Append the audio element, delay button, and close button to the container
  audioContainer.appendChild(delayPlayButton);
  audioContainer.appendChild(audioElement);
  audioContainer.appendChild(closeButton);

  // Count existing audio players
  const existingPlayers = document.querySelectorAll(".audio-player-container");

  // Set dynamic positioning so each new player appears above the previous one
  const baseBottom = 10; // Initial bottom position
  const spacing = 56; // Space between players
  audioContainer.style.bottom = `${
    baseBottom + existingPlayers.length * spacing
  }px`;
  audioContainer.style.right = "10px"; // Keep it fixed to the right

  // Append the container to the body
  document.body.appendChild(audioContainer);

  // Function to re-adjust audio positions when one is removed
  function adjustAudioPositions() {
    const players = document.querySelectorAll(".audio-player-container");
    players.forEach((player, index) => {
      player.style.bottom = `${baseBottom + index * spacing}px`;
    });
  }
}
