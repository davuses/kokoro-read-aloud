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

function ensureClearAllButton() {
  let btn = document.querySelector("#clear-all-audio-button");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "clear-all-audio-button";
    btn.textContent = "× Clear all";
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tts-player-host").forEach((el) => {
        if (el._cleanup) el._cleanup();
        el.remove();
      });
      btn.style.display = "none";
    });
    document.body.appendChild(btn);
  }
  return btn;
}

// Shared player chrome: a fixed-position shadow host (so page CSS can't leak
// in) containing the flex row both the buffered and streaming players fill in.
function createPlayerShell() {
  ensureClearAllButton();
  const host = document.createElement("div");
  host.classList.add("tts-player-host");
  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = PLAYER_CSS;
  shadow.appendChild(styleEl);
  const audioContainer = document.createElement("div");
  audioContainer.classList.add("audio-player-container");
  shadow.appendChild(audioContainer);
  host.style.position = "fixed";
  host.style.right = "10px";
  host.style.zIndex = "9999";
  return { host, audioContainer };
}

// Volume-boost multipliers, indexed by the popup's gain slider.
const GAIN_LEVELS = [1.0, 1.25, 1.5, 1.75, 2.0];

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function makePlayerButton(text, title) {
  const b = document.createElement("button");
  b.classList.add("player-btn");
  if (text != null) b.textContent = text;
  if (title) b.title = title;
  return b;
}

function makeCloseButton(host) {
  const b = document.createElement("button");
  b.innerHTML = "&times;";
  b.classList.add("close-button");
  b.addEventListener("click", () => {
    host._cleanup();
    host.remove();
    adjustAudioPositions();
  });
  return b;
}

// Progress bar with fill + thumb and click/drag seeking. onSeek(fraction) fires
// on release; canSeek() gates interaction (e.g. until any audio exists).
function createProgressBar(onSeek, canSeek = () => true) {
  const track = document.createElement("div");
  track.classList.add("progress-track");
  const fill = document.createElement("div");
  fill.classList.add("progress-fill");
  fill.style.width = "0%";
  const thumb = document.createElement("div");
  thumb.classList.add("progress-thumb");
  thumb.style.left = "0%";
  track.appendChild(fill);
  track.appendChild(thumb);

  let dragging = false;
  function setProgress(fraction) {
    const pct = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    fill.style.width = pct;
    thumb.style.left = pct;
  }
  function fractionFrom(e) {
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }
  track.addEventListener("mousedown", (e) => {
    if (!canSeek()) return;
    e.preventDefault();
    dragging = true;
    track.classList.add("progress-track--dragging");
    setProgress(fractionFrom(e));
    const onMove = (e) => setProgress(fractionFrom(e));
    const onUp = (e) => {
      dragging = false;
      track.classList.remove("progress-track--dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      onSeek(fractionFrom(e));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  return { track, setProgress, isDragging: () => dragging };
}

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "tts-stream") return;
  createStreamingPlayer(port);
});

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
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = GAIN_LEVELS[gainIndex] ?? 1.0;
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
  let timer = null;

  function getElapsed() {
    if (!isPlaying) return pauseOffset;
    return Math.min(audioCtx.currentTime - startedAt, duration);
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

  const { host, audioContainer } = createPlayerShell();

  const playPauseBtn = makePlayerButton();

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

  // Progress bar — seek restarts playback from the clicked position.
  const progress = createProgressBar((fraction) => {
    if (isPlaying) source._stopManually();
    isPlaying = false;
    pauseOffset = fraction * duration;
    startSource(pauseOffset);
    ended = false;
    updatePlayButton();
  });

  // Time display
  const timeDisplay = document.createElement("span");
  timeDisplay.classList.add("time-display");

  function updateTime() {
    const elapsed = getElapsed();
    timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    if (!progress.isDragging()) progress.setProgress(elapsed / duration);
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

  const downloadButton = makePlayerButton("⬇", "Download audio");
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

  const closeButton = makeCloseButton(host);

  audioContainer.appendChild(playPauseBtn);
  audioContainer.appendChild(progress.track);
  audioContainer.appendChild(timeDisplay);
  audioContainer.appendChild(downloadButton);
  audioContainer.appendChild(closeButton);

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

// Streaming player: fed PCM chunks over a port as the server generates them.
// Plays them gaplessly with a rolling-window scheduler (only ~1s scheduled
// ahead) so pause/seek stay simple, and starts on the first chunk (~1s) instead
// of waiting for the whole narration.
function createStreamingPlayer(port) {
  // Attach the message handler synchronously so no early chunks are missed.
  const pending = [];
  let onPortMessage = (msg) => pending.push(msg);
  port.onMessage.addListener((msg) => onPortMessage(msg));

  const { host, audioContainer } = createPlayerShell();

  const audioCtx = new AudioContext();
  const gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  api.storage.sync.get(["volumeBoostIndex"], (r) => {
    gainNode.gain.value = GAIN_LEVELS[r.volumeBoostIndex ?? 0] ?? 1.0;
  });

  const LOOKAHEAD = 1.0; // seconds of audio scheduled ahead of the playhead
  const chunks = []; // { buffer, start } cumulative timeline
  const pcmParts = []; // Int16Array per chunk, kept for WAV download
  let sampleRate = 24000;
  let totalDuration = 0; // grows as chunks arrive
  let receivedEnd = false;

  let isPlaying = false;
  let finished = false;
  let startOffset = 0; // timeline position where the current run began
  let startCtxTime = 0; // audioCtx.currentTime at run start
  let scheduledUntil = 0; // timeline position scheduled so far this run
  let activeSources = [];
  let pumpTimer = null;
  let uiTimer = null;

  function position() {
    if (!isPlaying) return startOffset;
    return Math.min(startOffset + (audioCtx.currentTime - startCtxTime), totalDuration);
  }

  function stopActiveSources() {
    for (const s of activeSources) {
      try { s.onended = null; s.stop(); } catch (e) { /* already stopped */ }
    }
    activeSources = [];
  }

  function chunkIndexAt(p) {
    for (let i = 0; i < chunks.length; i++) {
      if (p < chunks[i].start + chunks[i].buffer.duration) return i;
    }
    return chunks.length - 1;
  }

  // Schedule chunks up to LOOKAHEAD ahead of the playhead. Called on a timer
  // and whenever a new chunk arrives.
  function pump() {
    if (!isPlaying) return;
    const playhead = startOffset + (audioCtx.currentTime - startCtxTime);
    while (scheduledUntil < totalDuration &&
           scheduledUntil - playhead < LOOKAHEAD) {
      const i = chunkIndexAt(scheduledUntil);
      const intoBuffer = scheduledUntil - chunks[i].start;
      const whenCtx = startCtxTime + (scheduledUntil - startOffset);
      const src = audioCtx.createBufferSource();
      src.buffer = chunks[i].buffer;
      src.connect(gainNode);
      src.start(Math.max(whenCtx, audioCtx.currentTime), Math.max(0, intoBuffer));
      activeSources.push(src);
      src.onended = () => {
        const idx = activeSources.indexOf(src);
        if (idx >= 0) activeSources.splice(idx, 1);
      };
      scheduledUntil = chunks[i].start + chunks[i].buffer.duration;
    }
    // Reached the end of all received audio.
    if (receivedEnd && position() >= totalDuration - 0.02) {
      startOffset = totalDuration; // park at the end so the bar/time read 100%
      isPlaying = false;
      finished = true;
      updatePlayButton();
    }
  }

  function play(fromOffset) {
    stopActiveSources();
    startOffset = Math.max(0, Math.min(fromOffset, totalDuration));
    startCtxTime = audioCtx.currentTime;
    scheduledUntil = startOffset;
    isPlaying = true;
    finished = false;
    audioCtx.resume();
    pump();
    updatePlayButton();
  }

  function pause() {
    startOffset = position();
    stopActiveSources();
    isPlaying = false;
    updatePlayButton();
  }

  // --- UI (shares the same chrome as the buffered player) ---
  const playPauseBtn = makePlayerButton();
  function updatePlayButton() {
    playPauseBtn.textContent = isPlaying ? "⏸" : finished ? "↺" : "▶";
  }
  playPauseBtn.addEventListener("click", () => {
    if (isPlaying) pause();
    else play(finished ? 0 : startOffset);
  });

  const progress = createProgressBar(
    (fraction) => play(fraction * totalDuration), // seek within received audio
    () => totalDuration > 0
  );

  const timeDisplay = document.createElement("span");
  timeDisplay.classList.add("time-display");
  function updateTime() {
    const live = receivedEnd ? "" : " …";
    timeDisplay.textContent =
      `${formatTime(position())} / ${formatTime(totalDuration)}${live}`;
    if (!progress.isDragging() && totalDuration > 0) {
      progress.setProgress(position() / totalDuration);
    }
  }

  const downloadButton = makePlayerButton("⬇", "Download audio");
  downloadButton.addEventListener("click", () => {
    let n = 0;
    for (const p of pcmParts) n += p.length;
    const pcm = new Int16Array(n);
    let off = 0;
    for (const p of pcmParts) { pcm.set(p, off); off += p.length; }
    const url = URL.createObjectURL(pcmToWavBlob(pcm, sampleRate));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tts-${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const closeButton = makeCloseButton(host);

  audioContainer.appendChild(playPauseBtn);
  audioContainer.appendChild(progress.track);
  audioContainer.appendChild(timeDisplay);
  audioContainer.appendChild(downloadButton);
  audioContainer.appendChild(closeButton);
  document.body.appendChild(host);
  adjustAudioPositions();

  updatePlayButton();
  updateTime();
  uiTimer = setInterval(updateTime, 200);
  pumpTimer = setInterval(pump, 150);

  // --- incoming chunks ---
  function addChunk(sr, int16) {
    sampleRate = sr;
    const buffer = audioCtx.createBuffer(1, int16.length, sr);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
    chunks.push({ buffer, start: totalDuration });
    pcmParts.push(int16);
    totalDuration += buffer.duration;

    // Auto-start on the first chunk if nothing else is playing on the page.
    if (chunks.length === 1) {
      const otherMedia = Array.from(document.querySelectorAll("audio, video"))
        .some((el) => !el.paused && !el.ended && el.readyState > 2);
      if (!otherMedia) play(0);
    } else if (isPlaying) {
      pump();
    }
  }

  function handleMessage(msg) {
    if (msg.type === "chunk") {
      const bin = atob(msg.pcm_b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      addChunk(msg.sr, new Int16Array(u8.buffer));
    } else if (msg.type === "end") {
      receivedEnd = true;
    } else if (msg.type === "error") {
      receivedEnd = true;
      timeDisplay.textContent = `⚠ ${String(msg.message).slice(0, 40)}`;
    }
  }

  // Drain anything buffered before the player finished initializing, then
  // switch to handling messages directly.
  onPortMessage = handleMessage;
  for (const m of pending) handleMessage(m);

  port.onDisconnect.addListener(() => { receivedEnd = true; });

  host._cleanup = () => {
    clearInterval(uiTimer);
    clearInterval(pumpTimer);
    stopActiveSources();
    audioCtx.close();
    try { port.disconnect(); } catch (e) { /* already gone */ }
  };
}

// Build a minimal 16-bit mono WAV blob from Int16 PCM samples.
function pcmToWavBlob(int16, sampleRate) {
  const dataLen = int16.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const wr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wr(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits
  wr(36, "data");
  dv.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(int16);
  return new Blob([buf], { type: "audio/wav" });
}
