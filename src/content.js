const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "tts_kokoro" || message.action === "tts_google_translate") {
    const base64Audio = message.audioBase64;
    if (base64Audio) {
      api.storage.sync.get(["volumeBoostIndex"], (result) => {
        createAudioPlayer(base64Audio, result.volumeBoostIndex ?? 0);
      });
    } else {
      console.error("No audio data received");
    }
  } else if (message.action === "getSelectedText") {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
      sendResponse({ success: true, text: selectedText });
    }
  }
});

async function createAudioPlayer(base64Audio, gainIndex) {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioCtx = new AudioContext();
  const gainLevels = [1.0, 1.25, 1.5, 1.75, 2.0];
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = gainLevels[gainIndex] ?? 1.0;
  gainNode.connect(audioCtx.destination);

  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
  } catch (e) {
    console.error("Failed to decode audio:", e);
    audioCtx.close();
    return;
  }

  const duration = audioBuffer.duration;
  let source = null;
  let startedAt = 0;
  let pauseOffset = 0;
  let isPlaying = false;
  let ended = false;

  function getElapsed() {
    if (!isPlaying) return pauseOffset;
    return Math.min(audioCtx.currentTime - startedAt, duration);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  }

  function startSource(offset) {
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);
    source.start(0, offset);
    startedAt = audioCtx.currentTime - offset;
    isPlaying = true;
    source.onended = () => {
      if (isPlaying) {
        isPlaying = false;
        ended = true;
        pauseOffset = 0;
        updatePlayButton();
      }
    };
  }

  // Clear all button
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
      document.querySelectorAll(".audio-player-container").forEach((el) => el.remove());
      clearAllButton.style.display = "none";
    });
    document.body.appendChild(clearAllButton);
  }
  clearAllButton.style.display = "block";

  const audioContainer = document.createElement("div");
  audioContainer.classList.add("audio-player-container");

  // Delay button
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
      if (!isPlaying) {
        if (ended) pauseOffset = 0;
        startSource(pauseOffset);
        ended = false;
        updatePlayButton();
      }
      delayPlayButton.disabled = false;
    }, 2000);
  });

  // Play/Pause button
  const playPauseBtn = document.createElement("button");
  playPauseBtn.style.marginRight = "6px";
  playPauseBtn.style.padding = "4px 10px";
  playPauseBtn.style.border = "none";
  playPauseBtn.style.backgroundColor = "#3498db";
  playPauseBtn.style.color = "white";
  playPauseBtn.style.borderRadius = "6px";
  playPauseBtn.style.cursor = "pointer";
  playPauseBtn.style.fontFamily = "sans-serif";

  function updatePlayButton() {
    playPauseBtn.textContent = isPlaying ? "⏸" : ended ? "↺" : "▶";
  }

  playPauseBtn.addEventListener("click", () => {
    if (isPlaying) {
      pauseOffset = getElapsed();
      source.stop();
      isPlaying = false;
      updatePlayButton();
    } else {
      if (ended) pauseOffset = 0;
      startSource(pauseOffset);
      ended = false;
      updatePlayButton();
    }
  });

  // Progress bar
  const progressTrack = document.createElement("div");
  progressTrack.style.width = "140px";
  progressTrack.style.height = "6px";
  progressTrack.style.backgroundColor = "rgba(255,255,255,0.3)";
  progressTrack.style.borderRadius = "3px";
  progressTrack.style.cursor = "pointer";
  progressTrack.style.marginRight = "6px";
  progressTrack.style.flexShrink = "0";
  progressTrack.style.position = "relative";

  const progressFill = document.createElement("div");
  progressFill.style.width = "0%";
  progressFill.style.height = "100%";
  progressFill.style.backgroundColor = "#3498db";
  progressFill.style.borderRadius = "3px";
  progressFill.style.pointerEvents = "none";
  progressTrack.appendChild(progressFill);

  progressTrack.addEventListener("click", (e) => {
    const rect = progressTrack.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const seekTo = fraction * duration;
    if (isPlaying) source.stop();
    isPlaying = false;
    pauseOffset = seekTo;
    startSource(seekTo);
    ended = false;
    updatePlayButton();
  });

  // Time display
  const timeDisplay = document.createElement("span");
  timeDisplay.style.color = "white";
  timeDisplay.style.fontFamily = "sans-serif";
  timeDisplay.style.fontSize = "13px";
  timeDisplay.style.marginRight = "8px";
  timeDisplay.style.minWidth = "80px";
  timeDisplay.style.display = "inline-block";

  function updateTime() {
    const elapsed = getElapsed();
    timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    progressFill.style.width = `${(elapsed / duration) * 100}%`;
  }

  // Close button
  const closeButton = document.createElement("button");
  closeButton.innerHTML = "&times;";
  closeButton.classList.add("close-button");
  closeButton.addEventListener("click", () => {
    if (source && isPlaying) source.stop();
    audioCtx.close();
    audioContainer.remove();
    adjustAudioPositions();
  });

  audioContainer.appendChild(delayPlayButton);
  audioContainer.appendChild(playPauseBtn);
  audioContainer.appendChild(progressTrack);
  audioContainer.appendChild(timeDisplay);
  audioContainer.appendChild(closeButton);

  const existingPlayers = document.querySelectorAll(".audio-player-container");
  const baseBottom = 10;
  const spacing = 56;
  audioContainer.style.bottom = `${baseBottom + existingPlayers.length * spacing}px`;
  audioContainer.style.right = "10px";
  document.body.appendChild(audioContainer);

  // Auto-play if no other media is playing
  const otherMediaPlaying = Array.from(document.querySelectorAll("audio, video"))
    .some((el) => !el.paused && !el.ended && el.readyState > 2);

  if (!otherMediaPlaying) {
    await audioCtx.resume();
    startSource(0);
  }

  updatePlayButton();
  updateTime();

  const timer = setInterval(() => {
    if (ended) {
      clearInterval(timer);
    } else {
      updateTime();
    }
  }, 250);

  // Clean up timer if container is removed externally (e.g. clear-all button)
  new MutationObserver((_, obs) => {
    if (!document.contains(audioContainer)) {
      clearInterval(timer);
      if (source && isPlaying) source.stop();
      audioCtx.close();
      obs.disconnect();
    }
  }).observe(document.body, { childList: true, subtree: true });

  function adjustAudioPositions() {
    document.querySelectorAll(".audio-player-container").forEach((player, index) => {
      player.style.bottom = `${baseBottom + index * spacing}px`;
    });
  }
}
