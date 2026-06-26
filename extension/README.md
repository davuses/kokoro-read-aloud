# TTS with Kokoro — browser extension

A cross-browser (Chrome/MV3 and Firefox/MV2) extension that reads web text aloud.
It has two engines:

- **Kokoro** — high-quality neural TTS, streamed from your own local
  [kokoro-server](../server). Low latency on long text and a karaoke-style
  highlight that follows along as it reads.
- **Google Translate** — a zero-setup fallback that fetches audio directly from
  Google's public translate TTS endpoint (no local server needed).

> **Kokoro requires the companion server.** Install and run
> [kokoro-server](../server) first; by default the extension talks to it at
> `http://localhost:18001` (configurable in the popup). Google Translate works
> without it.

## Features

- Read **selected text** (context menu or `Alt+S`).
- **Read an element** — hover/click a paragraph or section to read just that.
- **Read from here to the end** — read from the right-clicked spot onward.
- **Read the main article** — best-effort detection of the page's main content.
- Streaming player with play/pause, seek, and a WAV download (Kokoro).
- Sentence-level highlight synced to the audio (Kokoro).

## Build

The extension is built per-target from shared sources by `build.js`, which merges
`manifest.base.json` with the per-target override and copies `public/` + `src/`
into `dist-<target>/`.

```bash
npm install          # one-time: installs deepmerge (the only build dep)
npm run build:chrome     # -> dist-chrome/
npm run build:firefox    # -> dist-firefox/
```

## Install (unpacked / temporary)

This extension is not on any store yet, so it installs as an unpacked build.

**No build needed:** grab a prebuilt zip from the
[Releases](https://github.com/davuses/kokoro-read-aloud/releases) page
(`kokoro-extension-chrome.zip` / `kokoro-extension-firefox.zip`), unzip it, and
load the unzipped folder using the steps below. The zips are produced
automatically for each tagged release — you only need the build commands if you
are developing or want an unreleased version.

**Chrome / Chromium / Edge**
1. `npm run build:chrome` (or unzip a release `kokoro-extension-chrome.zip`).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist-chrome/` folder (or the unzipped folder).

**Firefox**
1. `npm run build:firefox` (or unzip a release `kokoro-extension-firefox.zip`).
2. Open `about:debugging#/runtime/this-firefox`.
3. **Load Temporary Add-on** → select any file inside the folder
   (e.g. `manifest.json`). Or run `npm run start:firefox` (requires `web-ext`).

   Temporary add-ons are removed when Firefox restarts; permanent installation
   requires signing the build through [AMO](https://addons.mozilla.org/).

## Usage

1. Start [kokoro-server](../server) (for the Kokoro engine).
2. Click the toolbar icon and pick an engine/voice. When a Kokoro voice is
   selected, a status line shows whether the server is reachable, and a
   **Kokoro server URL** field lets you point at a non-default address.
3. Select text and choose **TTS with Kokoro** from the context menu (or press
   `Alt+S`), or use one of the page-reading context-menu items.

## Permissions

- `activeTab`, `<all_urls>` content script — to read the text you select/click
  and to draw the in-page player and highlight.
- `contextMenus` — the right-click reading actions.
- `storage` — remembers your chosen engine/voice and server URL.
- `notifications` — surfaces TTS errors (e.g. server unreachable).

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: text you choose to read is sent either to
**your own** kokoro-server, or — for the Google Translate engine — to Google's
public TTS endpoint. Nothing is collected or stored by the extension beyond your
local settings.

## License

[Apache-2.0](../LICENSE).
