const api = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const ttsSelect = document.getElementById("tts-select");
  const gainSlider = document.getElementById("gain-slider");
  const streamingToggle = document.getElementById("streaming-toggle");

  api.storage.sync.get("ttsEngine", (data) => {
    ttsSelect.value = data.ttsEngine || "google-translate";
    updateServerStatus();
  });

  api.storage.sync.get(["playbackMode"], (r) => {
    streamingToggle.checked = r.playbackMode === "streaming";
  });

  streamingToggle.addEventListener("change", () => {
    api.storage.sync.set({
      playbackMode: streamingToggle.checked ? "streaming" : "buffered",
    });
  });

  ttsSelect.addEventListener("change", () => {
    api.storage.sync.set({ ttsEngine: ttsSelect.value });
    updateServerStatus();
  });

  ttsSelect.addEventListener("wheel", (e) => {
    e.preventDefault();
    const next = Math.max(0, Math.min(ttsSelect.options.length - 1, ttsSelect.selectedIndex + (e.deltaY > 0 ? 1 : -1)));
    ttsSelect.selectedIndex = next;
    ttsSelect.dispatchEvent(new Event("change"));
  });

  api.storage.sync.get(["volumeBoostIndex"], (result) => {
    if (result.volumeBoostIndex !== undefined) gainSlider.value = result.volumeBoostIndex;
  });

  gainSlider.addEventListener("input", () => {
    api.storage.sync.set({ volumeBoostIndex: parseInt(gainSlider.value, 10) });
  });
});

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
    await fetch("http://localhost:18001/", { signal: AbortSignal.timeout(1500) });
    indicator.textContent = "● Server online";
    indicator.className = "server-status online";
  } catch {
    indicator.textContent = "● Server offline — start kokoro-server";
    indicator.className = "server-status offline";
  }
}
