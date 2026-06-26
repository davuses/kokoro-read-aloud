// `api`, `DEFAULT_SPEED`, and `getServerUrl` come from shared.js, which build.js
// prepends to this file (see its comment for why concatenation, not imports).
const actionApi = api.action ?? api.browserAction;

function createMenus() {
  api.contextMenus.create({
    id: "ttsReadElement",
    title: "Read an element aloud…",
    contexts: ["page"],
  });
  api.contextMenus.create({
    id: "ttsReadFromHere",
    title: "Read from here to the end",
    contexts: ["page", "selection"],
  });
  api.contextMenus.create({
    id: "ttsReadArticle",
    title: "Read main article aloud",
    contexts: ["page"],
  });
}

api.runtime.onInstalled.addListener(createMenus);
api.runtime.onStartup.addListener(createMenus);

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ttsReadElement") {
    // Ask the page to enter element-picker mode; it sends back "tts_text".
    api.tabs.sendMessage(tab.id, { action: "enterPickMode" });
  } else if (info.menuItemId === "ttsReadFromHere") {
    // Read the right-clicked element and everything after it.
    api.tabs.sendMessage(tab.id, { action: "readFromHere" });
  } else if (info.menuItemId === "ttsReadArticle") {
    // Detect and read the page's main article content.
    api.tabs.sendMessage(tab.id, { action: "readArticle" });
  }
});

// Text extracted by the content-script readers (element picker, "read from
// here", "read main article") comes back here to be synthesized.
api.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "tts_text" && message.text && sender.tab) {
    handleTTS(message.text, sender.tab.id);
  }
});

async function handleTTS(selectedText, tabId) {
  api.storage.sync.get(["ttsEngine", "ttsSpeed"], async (data) => {
    const ttsEngine = data.ttsEngine || "google-translate";

    if (ttsEngine.startsWith("kokoro")) {
      // Kokoro always streams: lower latency for long narration, and the
      // streaming player can still export the full audio as a WAV download.
      const voice = ttsEngine.split("_").slice(1).join("_");
      const speed = Number(data.ttsSpeed) || DEFAULT_SPEED;
      streamKokoro(selectedText, voice, tabId, speed);
    } else if (ttsEngine === "google-translate") {
      const gtUrl = `https://www.google.com/speech-api/v1/synthesize?text=${encodeURIComponent(selectedText)}&enc=mpeg&lang=en-us&speed=0.45&client=lr-language-tts&use_google_only_voices=1`;

      actionApi?.setBadgeText({ text: "…", tabId });
      actionApi?.setBadgeBackgroundColor({ color: "#3b82f6", tabId });

      try {
        const response = await fetch(gtUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioBlob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          actionApi?.setBadgeText({ text: "", tabId });
          api.tabs.sendMessage(tabId, {
            action: "tts_google_translate",
            audioBase64: reader.result.split(",")[1],
          });
        };
        reader.readAsDataURL(audioBlob);
      } catch (error) {
        actionApi?.setBadgeText({ text: "!", tabId });
        actionApi?.setBadgeBackgroundColor({ color: "#ef4444", tabId });
        setTimeout(() => actionApi?.setBadgeText({ text: "", tabId }), 2500);
        api.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "TTS Error",
          message: `Google Translate TTS failed: ${error.message}`,
        });
      }
    }
  });
}

// Streaming playback: open a port to the page, stream NDJSON PCM chunks from
// the server, and forward each to the streaming player. Closing the player
// disconnects the port, which aborts the fetch so the server stops generating.
async function streamKokoro(text, voice, tabId, speed = DEFAULT_SPEED) {
  let port;
  try {
    port = api.tabs.connect(tabId, { name: "tts-stream" });
  } catch (e) {
    console.error("Could not connect to page for streaming:", e);
    return;
  }

  const controller = new AbortController();
  let aborted = false;
  port.onDisconnect.addListener(() => {
    aborted = true;
    controller.abort();
  });

  actionApi?.setBadgeText({ text: "…", tabId });
  actionApi?.setBadgeBackgroundColor({ color: "#3b82f6", tabId });

  try {
    const serverUrl = await getServerUrl();
    const response = await fetch(`${serverUrl}/tts/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "Unknown error";
      try {
        const j = await response.json();
        if (j.detail) detail = j.detail;
      } catch (e) {
        console.error("Failed to parse error response:", e);
      }
      throw new Error(`${response.status} - ${detail}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (e) {
          continue;
        }
        if (obj.pcm_b64) {
          // Forward the grapheme text too — the player aligns highlighting to it.
          port.postMessage({ type: "chunk", sr: obj.sr, pcm_b64: obj.pcm_b64, text: obj.text });
        } else if (obj.error) {
          port.postMessage({ type: "error", message: obj.error });
        } else if (obj.done) {
          port.postMessage({ type: "end" });
        }
      }
    }
    actionApi?.setBadgeText({ text: "", tabId });
    try { port.disconnect(); } catch (e) { /* page gone */ }
  } catch (error) {
    actionApi?.setBadgeText({ text: "", tabId });
    if (aborted || error.name === "AbortError") return; // user closed the player
    actionApi?.setBadgeText({ text: "!", tabId });
    actionApi?.setBadgeBackgroundColor({ color: "#ef4444", tabId });
    setTimeout(() => actionApi?.setBadgeText({ text: "", tabId }), 2500);
    console.error("TTS stream error:", error);
    try { port.postMessage({ type: "error", message: error.message }); } catch (e) { /* page gone */ }
    api.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "TTS Server Error",
      message: `${error.message}. Make sure the kokoro-server is running and the URL in the popup is correct.`,
    });
    try { port.disconnect(); } catch (e) { /* page gone */ }
  }
}
