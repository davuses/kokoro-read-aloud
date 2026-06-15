document.addEventListener("DOMContentLoaded", () => {
  const ttsSelect = document.getElementById("tts-select");

  chrome.storage.sync.get("ttsEngine", (data) => {
    if (data.ttsEngine) {
      ttsSelect.value = data.ttsEngine;
    } else {
      ttsSelect.value = "google-translate";
    }
  });

  // Save the selected TTS engine when the button is clicked
  ttsSelect.addEventListener("change", () => {
    const selectedEngine = ttsSelect.value;
    chrome.storage.sync.set({ ttsEngine: selectedEngine }, () => {
      console.log("Settings saved for:", selectedEngine);
    });
  });

  const gainSlider = document.getElementById("gain-slider");
  const gainLevels = [1.0, 1.25, 1.5, 1.75, 2.0];
  chrome.storage.sync.get(["volumeBoostIndex"], (result) => {
    if (result.volumeBoostIndex !== undefined) {
      gainSlider.value = result.volumeBoostIndex;
    }
  });

  gainSlider.addEventListener("input", () => {
    const index = parseInt(gainSlider.value, 10);
    chrome.storage.sync.set({ volumeBoostIndex: index }, () => {
      console.log("Saved volume boost:", gainLevels[index]);
    });
  });
});
const select = document.getElementById("tts-select");

select.addEventListener("wheel", (event) => {
  event.preventDefault(); // Prevent default page scrolling

  const currentIndex = select.selectedIndex;
  const maxIndex = select.options.length - 1;

  if (event.deltaY > 0 && currentIndex < maxIndex) {
    // Scroll down: go to next option
    select.selectedIndex += 1;
  } else if (event.deltaY < 0 && currentIndex > 0) {
    // Scroll up: go to previous option
    select.selectedIndex -= 1;
  }

  // Optional: trigger change event if needed
  select.dispatchEvent(new Event("change"));
});
