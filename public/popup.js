const api = typeof browser !== "undefined" ? browser : chrome;

const KOKORO_SERVER = "http://localhost:18001";

// Fallback used only when the server is unreachable, so the dropdown still
// renders (and a previously selected voice still displays) while offline. The
// server's /voices endpoint is the source of truth when it is reachable.
const FALLBACK_VOICES = [
  "af_bella", "af_heart", "af_sarah", "af_sky",
  "am_echo", "am_liam", "am_michael",
];

document.addEventListener("DOMContentLoaded", async () => {
  const ttsSelect = document.getElementById("tts-select");

  const voices = await fetchVoices();
  populateVoices(ttsSelect, voices);

  api.storage.sync.get("ttsEngine", (data) => {
    const stored = data.ttsEngine || "google-translate";
    // If a previously saved voice isn't in the current list (server offline,
    // or a voice was removed), keep it as an option so the user's saved choice
    // still shows instead of silently snapping back to Google Translate.
    if (stored.startsWith("kokoro_") && !optionExists(ttsSelect, stored)) {
      addVoiceOption(ttsSelect, stored.slice("kokoro_".length));
    }
    ttsSelect.value = stored;
    updateServerStatus();
  });

  ttsSelect.addEventListener("change", () => {
    api.storage.sync.set({ ttsEngine: ttsSelect.value });
    updateServerStatus();
  });

  const pickBtn = document.getElementById("pick-element-btn");
  pickBtn.addEventListener("click", async () => {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) {
      api.tabs.sendMessage(tab.id, { action: "enterPickMode" });
      window.close();
    }
  });

  ttsSelect.addEventListener("wheel", (e) => {
    e.preventDefault();
    const next = Math.max(0, Math.min(ttsSelect.options.length - 1, ttsSelect.selectedIndex + (e.deltaY > 0 ? 1 : -1)));
    ttsSelect.selectedIndex = next;
    ttsSelect.dispatchEvent(new Event("change"));
  });
});

async function fetchVoices() {
  try {
    const resp = await fetch(`${KOKORO_SERVER}/voices`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (Array.isArray(data.voices) && data.voices.length) return data.voices;
  } catch {
    // Server offline / unreachable — fall through to the bundled list.
  }
  return FALLBACK_VOICES;
}

function optionExists(select, value) {
  return !!select.querySelector(`option[value="${value}"]`);
}

function addVoiceOption(select, voice) {
  const opt = document.createElement("option");
  opt.value = `kokoro_${voice}`;
  opt.textContent = `Kokoro ${voice.replace(/_/g, " ")}`;
  select.appendChild(opt);
}

function populateVoices(select, voices) {
  // Clear any existing Kokoro options, then rebuild from the given list. The
  // Google Translate option lives in popup.html and is left untouched.
  select.querySelectorAll('option[value^="kokoro_"]').forEach((o) => o.remove());
  for (const voice of voices) addVoiceOption(select, voice);
}

function updateServerStatus() {
  const ttsSelect = document.getElementById("tts-select");
  const indicator = document.getElementById("server-status");
  const isKokoro = ttsSelect.value.startsWith("kokoro");
  indicator.style.display = isKokoro ? "block" : "none";
  if (isKokoro) pingServer(indicator);
}

async function pingServer(indicator) {
  indicator.textContent = "● Checking…";
  indicator.className = "server-status checking";
  try {
    await fetch(`${KOKORO_SERVER}/`, { signal: AbortSignal.timeout(1500) });
    indicator.textContent = "● Server online";
    indicator.className = "server-status online";
  } catch {
    indicator.textContent = "● Server offline — start kokoro-server";
    indicator.className = "server-status offline";
  }
}
