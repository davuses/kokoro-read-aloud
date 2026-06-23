const api = typeof browser !== "undefined" ? browser : chrome;

const PLAYER_CSS = `
  .audio-player-container {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(12, 12, 20, 0.82);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 8px 12px;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.07);
    transition: all 0.3s ease;
  }

  .player-btn {
    padding: 5px 11px;
    border: none;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-family: sans-serif;
    font-size: 14px;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .player-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.5);
  }

  .player-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(59, 130, 246, 0.25);
  }

  .player-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .progress-track {
    width: 140px;
    height: 6px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
    transition: height 0.15s ease;
  }

  .progress-track:hover,
  .progress-track--dragging {
    height: 8px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #6366f1);
    border-radius: 3px;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(99, 102, 241, 0.45);
  }

  .progress-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 12px;
    height: 12px;
    background: white;
    border-radius: 50%;
    pointer-events: none;
    box-shadow: 0 0 6px rgba(99, 102, 241, 0.7);
    transition: transform 0.15s ease;
  }

  .progress-track:hover .progress-thumb,
  .progress-track--dragging .progress-thumb {
    transform: translate(-50%, -50%) scale(1);
  }

  .time-display {
    color: rgba(255, 255, 255, 0.7);
    font-family: sans-serif;
    font-size: 12px;
    min-width: 75px;
    display: inline-block;
    letter-spacing: 0.2px;
  }

  .close-button {
    background-color: rgba(231, 76, 60, 0.85);
    color: white;
    font-size: 18px;
    font-weight: bold;
    border: none;
    padding: 8px;
    margin-left: 2px;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.15s ease;
  }

  .close-button:hover {
    background-color: #c0392b;
    transform: scale(1.1);
  }

  .close-button:focus {
    outline: none;
    box-shadow: 0 0 5px rgba(231, 76, 60, 0.8);
  }
`;

const BASE_BOTTOM = 10;
const PLAYER_SPACING = 56;

function adjustAudioPositions() {
  const hosts = document.querySelectorAll(".tts-player-host");
  hosts.forEach((h, index) => {
    h.style.bottom = `${BASE_BOTTOM + index * PLAYER_SPACING}px`;
  });
  const btn = document.querySelector("#clear-all-audio-button");
  if (!btn) return;
  if (hosts.length >= 2) {
    btn.style.display = "block";
    btn.style.bottom = `${BASE_BOTTOM + hosts.length * PLAYER_SPACING}px`;
  } else {
    btn.style.display = "none";
  }
}

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
  let isDragging = false;
  let timer = null;

  function getElapsed() {
    if (!isPlaying) return pauseOffset;
    return Math.min(audioCtx.currentTime - startedAt, duration);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  }

  function startSource(offset) {
    const thisSource = audioCtx.createBufferSource();
    thisSource.buffer = audioBuffer;
    thisSource.connect(gainNode);
    thisSource.start(0, offset);
    startedAt = audioCtx.currentTime - offset;
    isPlaying = true;
    source = thisSource;

    // Per-source flag: distinguishes manual stop (pause/seek) from natural end.
    // onended fires in both cases, but only natural end should mark the audio done.
    let stoppedManually = false;
    thisSource._stopManually = () => {
      stoppedManually = true;
      thisSource.stop();
    };

    thisSource.onended = () => {
      if (source === thisSource && !stoppedManually) {
        isPlaying = false;
        ended = true;
        pauseOffset = duration;
        updatePlayButton();
      }
    };

    startTimer();
  }

  // Clear all button lives in the real DOM (outside shadow)
  let clearAllButton = document.querySelector("#clear-all-audio-button");
  if (!clearAllButton) {
    clearAllButton = document.createElement("button");
    clearAllButton.id = "clear-all-audio-button";
    clearAllButton.textContent = "× Clear all";
    clearAllButton.addEventListener("click", () => {
      document.querySelectorAll(".tts-player-host").forEach((el) => {
        if (el._cleanup) el._cleanup();
        el.remove();
      });
      clearAllButton.style.display = "none";
    });
    document.body.appendChild(clearAllButton);
  }
  // Shadow host — sits in the real DOM for querying/positioning;
  // the player lives inside its shadow so page CSS can't interfere.
  const host = document.createElement("div");
  host.classList.add("tts-player-host");
  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = PLAYER_CSS;
  shadow.appendChild(styleEl);

  const audioContainer = document.createElement("div");
  audioContainer.classList.add("audio-player-container");
  shadow.appendChild(audioContainer);

  // Play/Pause button
  const playPauseBtn = document.createElement("button");
  playPauseBtn.classList.add("player-btn");

  function updatePlayButton() {
    playPauseBtn.textContent = isPlaying ? "⏸" : ended ? "↺" : "▶";
  }

  playPauseBtn.addEventListener("click", () => {
    if (isPlaying) {
      pauseOffset = getElapsed();
      source._stopManually();
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
  progressTrack.classList.add("progress-track");

  const progressFill = document.createElement("div");
  progressFill.classList.add("progress-fill");
  progressFill.style.width = "0%";

  const progressThumb = document.createElement("div");
  progressThumb.classList.add("progress-thumb");
  progressThumb.style.left = "0%";

  progressTrack.appendChild(progressFill);
  progressTrack.appendChild(progressThumb);

  function setProgress(fraction) {
    const pct = `${fraction * 100}%`;
    progressFill.style.width = pct;
    progressThumb.style.left = pct;
  }

  function getFraction(e) {
    const rect = progressTrack.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function seekToFraction(fraction) {
    const seekTo = fraction * duration;
    if (isPlaying) source._stopManually();
    isPlaying = false;
    pauseOffset = seekTo;
    startSource(seekTo);
    ended = false;
    updatePlayButton();
  }

  progressTrack.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    progressTrack.classList.add("progress-track--dragging");
    setProgress(getFraction(e));

    const onMouseMove = (e) => {
      setProgress(getFraction(e));
    };

    const onMouseUp = (e) => {
      isDragging = false;
      progressTrack.classList.remove("progress-track--dragging");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      seekToFraction(getFraction(e));
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  // Time display
  const timeDisplay = document.createElement("span");
  timeDisplay.classList.add("time-display");

  function updateTime() {
    const elapsed = getElapsed();
    timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    if (!isDragging) {
      setProgress(elapsed / duration);
    }
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      updateTime();
      if (ended) {
        clearInterval(timer);
        timer = null;
      }
    }, 250);
  }

  // Download button
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "⬇";
  downloadButton.title = "Download audio";
  downloadButton.classList.add("player-btn");
  downloadButton.addEventListener("click", () => {
    // Rebuild bytes from base64: the Uint8Array passed to decodeAudioData gets
    // detached. A blob: download URL isn't governed by media-src CSP, so this
    // works even on strict sites like claude.ai.
    const bin = atob(base64Audio);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: "audio/mpeg" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tts-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Close button
  const closeButton = document.createElement("button");
  closeButton.innerHTML = "&times;";
  closeButton.classList.add("close-button");
  closeButton.addEventListener("click", () => {
    host._cleanup();
    host.remove();
    adjustAudioPositions();
  });

  audioContainer.appendChild(playPauseBtn);
  audioContainer.appendChild(progressTrack);
  audioContainer.appendChild(timeDisplay);
  audioContainer.appendChild(downloadButton);
  audioContainer.appendChild(closeButton);

  host.style.position = "fixed";
  host.style.right = "10px";
  host.style.zIndex = "9999";
  document.body.appendChild(host);
  adjustAudioPositions();

  // Auto-play if no other media is playing
  const otherMediaPlaying = Array.from(document.querySelectorAll("audio, video"))
    .some((el) => !el.paused && !el.ended && el.readyState > 2);

  if (!otherMediaPlaying) {
    await audioCtx.resume();
    startSource(0);
  }

  updatePlayButton();
  updateTime();

  // Cleanup stored on the host so the clear-all button can call it
  // without needing a MutationObserver watching the entire page DOM.
  host._cleanup = () => {
    clearInterval(timer);
    if (source && isPlaying) source.stop();
    audioCtx.close();
  };

}
