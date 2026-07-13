// Constants and helpers shared by the popup and the background service worker.
// There is no bundler, and the two run in different module systems (Chrome's
// MV3 service worker is an ES module; Firefox's MV2 background is a classic
// script), so build.js prepends this file's contents to each of them at build
// time instead of using import/export. It is never shipped as a standalone
// file. Keep it free of declarations that background.js / popup.js also make
// (notably `api`), since concatenation puts them in the same scope.
const api = typeof browser !== "undefined" ? browser : chrome;

// Default Kokoro server. The real URL is stored in storage.sync (editable in
// the popup and shared with the background script); this is only the fallback.
const DEFAULT_SERVER_URL = "http://localhost:18001";

// Default playback rate; 1.0 is natural speed.
const DEFAULT_SPEED = 1.0;

// Seconds of audio to generate ahead of the playhead. 0 = unlimited: generate
// the whole text as fast as the server can, which is the long-standing default
// (instant seeking, download ready immediately) at the cost of wasted compute
// if you stop listening early. A positive value caps that waste, but you can
// then only seek within what has been generated.
const DEFAULT_LOOKAHEAD = 0;

// Resolve the configured Kokoro server URL from storage, stripping trailing
// slashes and falling back to DEFAULT_SERVER_URL when nothing is stored.
function getServerUrl() {
  return new Promise((resolve) => {
    api.storage.sync.get("serverUrl", (data) => {
      resolve((data.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, ""));
    });
  });
}
