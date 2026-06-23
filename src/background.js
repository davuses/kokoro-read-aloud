const api = typeof browser !== "undefined" ? browser : chrome;
const actionApi = api.action ?? api.browserAction;

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: "ttsWithKokoro",
    title: "TTS with Kokoro",
    contexts: ["selection"],
  });
});

api.runtime.onStartup.addListener(() => {
  api.contextMenus.create({
    id: "ttsWithKokoro",
    title: "TTS with Kokoro",
    contexts: ["selection"],
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "ttsWithKokoro") {
    handleTTS(info.selectionText, tab.id);
  }
});

async function handleTTS(selectedText, tabId) {
  api.storage.sync.get(["ttsEngine", "playbackMode"], async (data) => {
    const ttsEngine = data.ttsEngine || "google-translate";

    if (ttsEngine.startsWith("kokoro")) {
      const voice = ttsEngine.split("_").slice(1).join("_");

      if (data.playbackMode === "streaming") {
        streamKokoro(selectedText, voice, tabId);
        return;
      }

      actionApi?.setBadgeText({ text: "…", tabId });
      actionApi?.setBadgeBackgroundColor({ color: "#3b82f6", tabId });

      try {
        const response = await fetch("http://localhost:18001/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: selectedText, voice }),
        });

        if (!response.ok) {
          let errorDetail = "Unknown error";
          try {
            const errorData = await response.json();
            if (errorData.detail) errorDetail = errorData.detail;
          } catch (e) {
            console.error("Failed to parse error response:", e);
          }
          throw new Error(`${response.status} - ${errorDetail}`);
        }

        const audioBlob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          actionApi?.setBadgeText({ text: "", tabId });
          api.tabs.sendMessage(tabId, {
            action: "tts_kokoro",
            audioBase64: reader.result.split(",")[1],
          });
        };
        reader.readAsDataURL(audioBlob);
      } catch (error) {
        actionApi?.setBadgeText({ text: "!", tabId });
        actionApi?.setBadgeBackgroundColor({ color: "#ef4444", tabId });
        setTimeout(() => actionApi?.setBadgeText({ text: "", tabId }), 2500);
        console.error("TTS server error:", error);
        api.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "TTS Server Error",
          message: `${error.message}. Make sure the server is running at port 18001.`,
        });
      }
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
async function streamKokoro(text, voice, tabId) {
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
    const response = await fetch("http://localhost:18001/tts/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
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
          port.postMessage({ type: "chunk", sr: obj.sr, pcm_b64: obj.pcm_b64 });
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
      message: `${error.message}. Make sure the server is running at port 18001.`,
    });
    try { port.disconnect(); } catch (e) { /* page gone */ }
  }
}

api.commands.onCommand.addListener(async (command) => {
  if (command === "Text to Speech") {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    api.tabs.sendMessage(tab.id, { action: "getSelectedText" }, (response) => {
      if (response?.text) {
        handleTTS(response.text, tab.id);
      } else {
        api.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "No Text Selected",
          message: "Please select some text before using the TTS feature.",
        });
      }
    });
  }
});
