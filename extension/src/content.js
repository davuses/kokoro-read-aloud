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

// Registry of on-screen players so a newly started one can pause the others.
// They play through the Web Audio API (not <audio> elements), so the browser
// won't pause them for us — without this, stacked players talk over each other.
const activePlayers = new Set();
function pauseOtherPlayers(except) {
  for (const player of activePlayers) {
    if (player !== except) player.pause();
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// Decode a base64 string to a Uint8Array of its bytes.
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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
  // Hand the streaming player the page-reading source (if any) so it can
  // highlight along. Every reader (element pick, "read from here", "read
  // article") stashes one before asking the background to synthesize.
  const source = pendingReadSource;
  pendingReadSource = null;
  createStreamingPlayer(port, source);
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "tts_google_translate") {
    const base64Audio = message.audioBase64;
    if (base64Audio) {
      createAudioPlayer(base64Audio);
    } else {
      console.error("No audio data received");
    }
  } else if (message.action === "enterPickMode") {
    startElementPicker();
  } else if (message.action === "readFromHere") {
    readFromHere();
  } else if (message.action === "readArticle") {
    readArticle();
  }
});

// Track the element under the last right-click so "Read from here to the end"
// has an anchor without a separate picking step.
let lastContextElement = null;
document.addEventListener(
  "contextmenu",
  (e) => {
    lastContextElement = e.target;
  },
  true
);

// Block-level, text-bearing elements treated as paragraphs for reading.
const READABLE_BLOCK_SELECTOR =
  "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, dd, td";

// id/class name fragments that mark an element as page furniture rather than
// article body — nav menus, comments, share/related widgets, ads, footers, etc.
const BOILERPLATE_RE =
  /(?:^|[-_\s])(?:nav|navbar|menus?|breadcrumbs?|shares?|social|comments?|disqus|related|recommend\w*|sidebars?|aside|widgets?|promos?|sponsors?|adverts?|ads?|newsletter|subscribe|footer|bylines?|caption|credits?|meta|tags?|cookie|banners?|popups?|modal|masthead|toolbars?)(?:[-_\s]|$)/i;

// True if the element sits inside a non-content landmark or a container whose
// id/class looks like boilerplate. Walks ancestors up to <body>.
function isBoilerplate(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const tag = n.tagName;
    if (tag === "NAV" || tag === "ASIDE" || tag === "FOOTER" || tag === "FIGURE") {
      return true;
    }
    const role = n.getAttribute && n.getAttribute("role");
    if (role && /^(navigation|complementary|banner|contentinfo|menu|search)$/i.test(role)) {
      return true;
    }
    const cls = typeof n.className === "string" ? n.className : "";
    const idClass = `${n.id || ""} ${cls}`.trim();
    if (idClass && BOILERPLATE_RE.test(idClass)) return true;
  }
  return false;
}

// Fraction of a block's text that sits inside links. High link density is the
// tell-tale of nav bars, tag clouds, "related stories", and footer link lists.
function linkDensity(el) {
  const total = (el.innerText || "").trim().length;
  if (!total) return 0;
  let linked = 0;
  for (const a of el.querySelectorAll("a")) linked += (a.innerText || "").length;
  return linked / total;
}

function readableBlocks(container) {
  return Array.from(
    container.querySelectorAll(READABLE_BLOCK_SELECTOR)
  ).filter((el) => {
    if (el.closest(".tts-player-host")) return false;
    const text = (el.innerText || "").trim();
    if (text.length < 2) return false;
    // Skip hidden/detached elements; offscreen-below-the-fold is fine.
    if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
      return false;
    }
    // Drop page furniture and link-heavy blocks — the main source of noise.
    if (isBoilerplate(el)) return false;
    if (linkDensity(el) > 0.5) return false;
    // Drop single-word UI labels ("Share", "Advertisement", "Menu") that aren't
    // headings — real prose has spaces.
    const isHeading = /^H[1-6]$/.test(el.tagName);
    if (!isHeading && text.length < 20 && !/\s/.test(text)) return false;
    return true;
  });
}

// A reading "session": the source roots the streaming player highlights against.
// Stashed right before asking the background to synthesize; the streaming port
// picks it up when it opens. Cleared after a few seconds if nothing consumes it
// (e.g. when the selected engine is Google Translate, which doesn't stream).
let pendingReadSource = null;

function startReading(roots) {
  roots = (roots || []).filter(Boolean);
  const text = roots
    .map((r) => r.innerText || "")
    .join("\n\n")
    .trim();
  if (!text) return;
  const src = { roots };
  pendingReadSource = src;
  setTimeout(() => {
    if (pendingReadSource === src) pendingReadSource = null;
  }, 8000);
  api.runtime.sendMessage({ action: "tts_text", text });
}

function readFromHere() {
  const start = lastContextElement;
  if (!start) return;
  // Scope to the article the click landed in so we don't sweep the sidebars,
  // comments, and footers that follow it in document order. Fall back to
  // main-article detection when the click isn't inside a semantic container.
  const root = start.closest("article, main, [role='main']") || findMainArticle();
  const blocks = readableBlocks(root);
  const idx = blocks.findIndex(
    (b) =>
      b === start ||
      b.contains(start) ||
      (start.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
  if (idx < 0) {
    // Nothing recognised at/after the click — fall back to the clicked block.
    startReading([start.closest(READABLE_BLOCK_SELECTOR) || start]);
    return;
  }
  startReading(blocks.slice(idx));
}

function readArticle() {
  const root = findMainArticle();
  // Read the article's filtered blocks (skipping in-article nav/captions/share
  // widgets) rather than the whole container's innerText. Fall back to the
  // container if filtering left nothing (e.g. an unusual layout).
  const blocks = readableBlocks(root);
  startReading(blocks.length ? blocks : [root]);
}

// Best-effort main-content detection, using Readability-style positive scoring
// (a lighter, live-DOM version of what Firefox Reader View does). Each paragraph
// scores by length and comma count — both signals of real prose — dampened by
// its link density, and that score propagates to ancestors (parent full,
// grandparent half, …). The highest-scoring ancestor is the article body.
function findMainArticle() {
  // Trust a semantic container only when it's clearly the article: enough text
  // and not mostly links (rejects nav-heavy <main> wrappers and feed <article>
  // cards). Otherwise fall through to scoring.
  for (const sel of ["article", "[role='main']", "main"]) {
    const el = document.querySelector(sel);
    if (el && (el.innerText || "").trim().length > 200 && linkDensity(el) < 0.3) {
      return el;
    }
  }

  const scores = new Map();
  const add = (el, s) => scores.set(el, (scores.get(el) || 0) + s);
  for (const p of document.querySelectorAll("p, blockquote, pre, li")) {
    const text = (p.innerText || "").trim();
    if (text.length < 25) continue;
    // Readability's paragraph score: base + one per comma + one per ~100 chars
    // (capped), scaled down by how much of it is links.
    const commas = (text.match(/,/g) || []).length;
    let score = (1 + commas + Math.min(Math.floor(text.length / 100), 3)) *
      (1 - linkDensity(p));
    if (score <= 0) continue;
    let el = p.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 3) {
      add(el, score / (depth + 1));
      el = el.parentElement;
      depth++;
    }
  }

  let best = null;
  let bestScore = 0;
  for (const [el, score] of scores) {
    // Penalize containers that are mostly links or look like boilerplate, so a
    // nav-heavy wrapper can't outscore the real body.
    const adjusted =
      score * (1 - linkDensity(el)) * (isBoilerplate(el) ? 0.2 : 1);
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = el;
    }
  }
  return best || document.body;
}

// On-demand element picker: hover to outline an element, ↑/↓ to grow/shrink the
// selection up/down the DOM tree, click (or Enter) to read everything inside it,
// Esc to cancel. The element's innerText is sent to the background, which runs
// it through the same TTS path as a normal selection.
let pickerActive = false;

function startElementPicker() {
  if (pickerActive) return;
  pickerActive = true;

  // Outline overlay: pointer-events:none so it never intercepts the hover it's
  // tracking, and a max z-index so it sits above sticky headers, modals, and
  // our own player.
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    border: "2px solid #6366f1",
    background: "rgba(99, 102, 241, 0.15)",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.6)",
    borderRadius: "3px",
    boxSizing: "border-box",
    display: "none",
  });

  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    background: "rgba(12, 12, 20, 0.92)",
    color: "#fff",
    font: "12px/1.4 sans-serif",
    padding: "3px 7px",
    borderRadius: "6px",
    whiteSpace: "nowrap",
    display: "none",
  });
  label.textContent = "Click to read  •  ↑↓ resize  •  Esc / right-click cancel";

  const cursorStyle = document.createElement("style");
  cursorStyle.textContent = "* { cursor: crosshair !important; }";

  document.head.appendChild(cursorStyle);
  document.body.appendChild(overlay);
  document.body.appendChild(label);

  let baseEl = null; // element directly under the cursor
  let level = 0; // how many parents up from baseEl is currently selected
  let current = null;

  function resolveCurrent() {
    let el = baseEl;
    for (let i = 0; i < level && el && el.parentElement; i++) {
      const p = el.parentElement;
      if (p === document.body || p === document.documentElement) break;
      el = p;
    }
    return el;
  }

  function draw() {
    current = resolveCurrent();
    if (!current) {
      overlay.style.display = "none";
      label.style.display = "none";
      return;
    }
    const r = current.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    label.style.display = "block";
    label.style.left = `${Math.max(2, r.left)}px`;
    label.style.top = `${r.top - 24 > 0 ? r.top - 24 : r.bottom + 4}px`;
  }

  function onMouseOver(e) {
    const t = e.target;
    if (!t || t === overlay || t === label) return;
    // Never target our own player chrome.
    if (t.closest && (t.closest(".tts-player-host") || t.id === "clear-all-audio-button")) return;
    baseEl = t;
    level = 0;
    draw();
  }

  function reposition() {
    if (current) draw();
  }

  function suppress(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onClick(e) {
    suppress(e);
    pick();
  }

  // Right-click cancels (in addition to Esc); the page menu stays suppressed.
  function onContextMenu(e) {
    suppress(e);
    stop();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      suppress(e);
      stop();
    } else if (e.key === "ArrowUp") {
      suppress(e);
      level += 1;
      draw();
    } else if (e.key === "ArrowDown") {
      suppress(e);
      level = Math.max(0, level - 1);
      draw();
    } else if (e.key === "Enter") {
      suppress(e);
      pick();
    }
  }

  function pick() {
    const el = current;
    stop();
    if (el) startReading([el]);
  }

  function stop() {
    pickerActive = false;
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("mousedown", suppress, true);
    document.removeEventListener("mouseup", suppress, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition, true);
    overlay.remove();
    label.remove();
    cursorStyle.remove();
  }

  // Capture phase throughout so page handlers never see the picking clicks/keys.
  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("mousedown", suppress, true);
  document.addEventListener("mouseup", suppress, true);
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition, true);
}

async function createAudioPlayer(base64Audio) {
  const bytes = base64ToBytes(base64Audio);

  const audioCtx = new AudioContext();

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

  function pause() {
    if (!isPlaying) return;
    pauseOffset = getElapsed();
    source._stopManually();
    isPlaying = false;
    updatePlayButton();
  }

  function startSource(offset) {
    pauseOtherPlayers(self); // taking over playback; quiet the others
    const thisSource = audioCtx.createBufferSource();
    thisSource.buffer = audioBuffer;
    thisSource.connect(audioCtx.destination);
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
      pause();
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
    const arr = base64ToBytes(base64Audio);
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

  const self = { pause };
  activePlayers.add(self);

  // Auto-play if no other page media is playing (startSource pauses sibling
  // TTS players itself).
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
    activePlayers.delete(self);
    clearInterval(timer);
    if (source && isPlaying) source.stop();
    audioCtx.close();
  };

}

// Streaming player: fed PCM chunks over a port as the server generates them.
// Plays them gaplessly with a rolling-window scheduler (only ~1s scheduled
// ahead) so pause/seek stay simple, and starts on the first chunk (~1s) instead
// of waiting for the whole narration.
function createStreamingPlayer(port, source) {
  // Attach the message handler synchronously so no early chunks are missed.
  const pending = [];
  let onPortMessage = (msg) => pending.push(msg);
  port.onMessage.addListener((msg) => onPortMessage(msg));

  const { host, audioContainer } = createPlayerShell();

  const audioCtx = new AudioContext();

  // Sentence-level highlighter over the source DOM (null if no source or the
  // CSS Custom Highlight API is unavailable). Audio still plays without it.
  const karaoke = source ? createKaraoke(source.roots, source.range) : null;

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
      src.connect(audioCtx.destination);
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
    pauseOtherPlayers(self); // taking over playback; quiet the others
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

  const self = { pause };
  activePlayers.add(self);

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
    if (karaoke) karaoke.update(position(), finished);
  }

  // Disabled until generation finishes, so a download can't capture a
  // half-generated clip. Re-enabled once all audio has arrived.
  const downloadButton = makePlayerButton("⬇", "Download (ready when finished)");
  downloadButton.disabled = true;
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
  function addChunk(sr, int16, text) {
    sampleRate = sr;
    const buffer = audioCtx.createBuffer(1, int16.length, sr);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
    const tStart = totalDuration;
    chunks.push({ buffer, start: totalDuration });
    pcmParts.push(int16);
    totalDuration += buffer.duration;
    if (karaoke && text) karaoke.addChunk(tStart, buffer.duration, text);

    // Auto-start on the first chunk if nothing else is playing on the page.
    if (chunks.length === 1) {
      const otherMedia = Array.from(document.querySelectorAll("audio, video"))
        .some((el) => !el.paused && !el.ended && el.readyState > 2);
      if (!otherMedia) play(0);
    } else if (isPlaying) {
      pump();
    }
  }

  // Allow the WAV download once no more audio is coming (and some arrived).
  function allowDownload() {
    if (pcmParts.length) {
      downloadButton.disabled = false;
      downloadButton.title = "Download audio";
    }
  }

  function handleMessage(msg) {
    if (msg.type === "chunk") {
      const u8 = base64ToBytes(msg.pcm_b64);
      addChunk(msg.sr, new Int16Array(u8.buffer), msg.text);
    } else if (msg.type === "end") {
      receivedEnd = true;
      allowDownload();
    } else if (msg.type === "error") {
      receivedEnd = true;
      allowDownload();
      timeDisplay.textContent = `⚠ ${String(msg.message).slice(0, 40)}`;
    }
  }

  // Drain anything buffered before the player finished initializing, then
  // switch to handling messages directly.
  onPortMessage = handleMessage;
  for (const m of pending) handleMessage(m);

  port.onDisconnect.addListener(() => { receivedEnd = true; allowDownload(); });

  host._cleanup = () => {
    activePlayers.delete(self);
    clearInterval(uiTimer);
    clearInterval(pumpTimer);
    stopActiveSources();
    if (karaoke) karaoke.clear();
    audioCtx.close();
    try { port.disconnect(); } catch (e) { /* already gone */ }
  };
}

// Sentence-level karaoke highlighter using the CSS Custom Highlight API, which
// paints ranges without mutating the DOM (no wrapping <mark> to break page JS).
// Returns null if the API is unavailable or there is no source to highlight.
//
// Alignment: the server tags each audio chunk with its grapheme text. We split
// that text into sentences and split the chunk's audio duration across them by
// character length, so each chunk re-anchors the timeline and drift stays
// bounded to within a single chunk. Each sentence's words are matched (forward,
// normalized to letters/digits so whitespace and punctuation differences don't
// matter) against a token index of the source's text nodes to build its range.
function createKaraoke(roots, range) {
  roots = (roots || []).filter(Boolean);
  if (
    typeof CSS === "undefined" ||
    !CSS.highlights ||
    typeof Highlight === "undefined" ||
    !roots.length
  ) {
    return null;
  }

  ensureHighlightStyle();
  const highlight = new Highlight();
  CSS.highlights.set("tts-reading", highlight);

  // Normalize a raw whitespace-delimited token to comparable letters/digits.
  const norm = (tok) => tok.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Flat, in-reading-order word index, each entry carrying its DOM position.
  // When a range is given (text-selection reads) only words fully inside it are
  // indexed, so matching can't anchor on identical words just outside it.
  const tokens = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && node.parentElement.closest(".tts-player-host")) {
        continue;
      }
      if (range && !range.intersectsNode(node)) continue;
      // Clip to the selected slice when this node holds a range boundary.
      let from = 0;
      let to = node.nodeValue.length;
      if (range) {
        if (node === range.startContainer) from = range.startOffset;
        if (node === range.endContainer) to = range.endOffset;
      }
      const value = node.nodeValue;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(value))) {
        if (m.index < from || m.index + m[0].length > to) continue;
        const w = norm(m[0]);
        if (w) tokens.push({ w, node, start: m.index, end: m.index + m[0].length });
      }
    }
  }

  let cursor = 0; // tokens before this are already consumed by earlier sentences
  function rangeForWords(words) {
    if (!words.length) return null;
    for (let i = cursor; i <= tokens.length - words.length; i++) {
      let k = 0;
      while (k < words.length && tokens[i + k].w === words[k]) k++;
      if (k === words.length) {
        const a = tokens[i];
        const b = tokens[i + words.length - 1];
        const range = document.createRange();
        range.setStart(a.node, a.start);
        range.setEnd(b.node, b.end);
        cursor = i + words.length;
        return range;
      }
    }
    return null;
  }

  function splitSentences(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return [];
    return clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).filter(Boolean);
  }

  const segments = []; // { tStart, tEnd, range } ordered by time
  let currentSeg = null;

  return {
    addChunk(tStart, duration, text) {
      const sentences = splitSentences(text);
      const totalLen = sentences.reduce((a, s) => a + s.length, 0) || 1;
      let cum = 0;
      for (const sentence of sentences) {
        const segStart = tStart + (cum / totalLen) * duration;
        cum += sentence.length;
        const segEnd = tStart + (cum / totalLen) * duration;
        const words = sentence.split(/\s+/).map(norm).filter(Boolean);
        segments.push({ tStart: segStart, tEnd: segEnd, range: rangeForWords(words) });
      }
    },
    update(pos) {
      let seg = null;
      for (const s of segments) {
        if (pos >= s.tStart && pos < s.tEnd) {
          seg = s;
          break;
        }
      }
      if (seg === currentSeg) return;
      currentSeg = seg;
      highlight.clear();
      if (seg && seg.range) highlight.add(seg.range);
    },
    clear() {
      highlight.clear();
      try {
        CSS.highlights.delete("tts-reading");
      } catch (e) {
        /* ignore */
      }
    },
  };
}

function ensureHighlightStyle() {
  if (document.getElementById("tts-highlight-style")) return;
  const s = document.createElement("style");
  s.id = "tts-highlight-style";
  s.textContent =
    "::highlight(tts-reading){background-color:rgba(99,102,241,0.35);color:inherit;}";
  document.head.appendChild(s);
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
