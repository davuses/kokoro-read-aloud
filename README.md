# kokoro-read-aloud

Read web pages aloud with [Kokoro](https://github.com/hexgrad/kokoro) TTS — a
self-hosted neural text-to-speech server plus a cross-browser extension that
streams from it, with a karaoke-style highlight that follows along as it reads.

This is a monorepo with two parts:

| Directory | What it is |
| --- | --- |
| [`server/`](server) | A small FastAPI server that streams Kokoro audio over HTTP. American English only. |
| [`extension/`](extension) | A Chrome (MV3) / Firefox (MV2) extension that reads selected text, a clicked element, or a page's main article — via the server (Kokoro) or a zero-setup Google Translate fallback. |

The extension's Kokoro engine needs the server running; its Google Translate
engine does not.

## Quickstart

**1. Run the server** (see [`server/README.md`](server/README.md) for details):

```bash
cd server
uv sync
uv run uvicorn server:app --host 127.0.0.1 --port 18001
```

The first request lazily loads the model (and downloads the weights once). It
uses the GPU when available and falls back to CPU otherwise.

**2. Build and load the extension** (see [`extension/README.md`](extension/README.md)):

```bash
cd extension
npm install
npm run build:chrome     # or build:firefox
```

Then load the unpacked `dist-chrome/` (or `dist-firefox/`) in your browser, pick
a Kokoro voice in the popup, and use the right-click menu or `Alt+S` to read.

## Privacy & security at a glance

- Text you read with **Kokoro** goes only to the server you run yourself.
- Text you read with **Google Translate** is sent to Google's public TTS
  endpoint. See [`extension/PRIVACY.md`](extension/PRIVACY.md).
- The server has **no auth or rate limiting** — bind it to `127.0.0.1` unless you
  intend to share it. See the server README's security notes.

## License

[Apache-2.0](LICENSE). The Kokoro model is also Apache-2.0.
