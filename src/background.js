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
  api.storage.sync.get("ttsEngine", async (data) => {
    const ttsEngine = data.ttsEngine || "google-translate";

    if (ttsEngine.startsWith("kokoro")) {
      const voice = ttsEngine.split("_").slice(1).join("_");

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
