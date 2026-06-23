# kokoro-server

A small [FastAPI](https://fastapi.tiangolo.com/) server that exposes the
[Kokoro](https://github.com/hexgrad/kokoro) text-to-speech model over HTTP.
Send it text, get audio streamed back as it is generated. Configured for
**American English** only.

## Requirements

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/)

The Kokoro model weights are downloaded automatically by the `kokoro` package
on first use.

## Setup

```bash
uv sync
```

## Running

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 18001
```

Port `18001` is what the companion kokoro-tts browser extension expects
(`http://localhost:18001/tts/stream`); change it only if you also update the
extension.

The model is loaded lazily on the **first** request, so the first response is
noticeably slower than the ones that follow.

## Tests

```bash
uv run pytest
```

The tests mock the model, so they run without a GPU (or the Kokoro weights) in
under a second.

## API

### `GET /voices`

Returns the list of allowed voices — the single source of truth, so clients can
populate a dropdown instead of hardcoding the list:

```json
{ "voices": ["af_bella", "af_heart", "af_sarah", "af_sky", "am_echo", "am_liam", "am_michael"] }
```

Cheap to call: it does not load the model.

### `POST /tts/stream`

Request body:

```json
{ "text": "Hello from Kokoro", "voice": "af_bella" }
```

Streams audio as it is generated for low-latency playback of long text: an
`application/x-ndjson` response with one JSON line per chunk —
`{"sr": 24000, "index": i, "pcm_b64": "<base64 Int16 mono PCM>", "text": "<the
grapheme text of this chunk>"}` — terminated by `{"done": true}`, or
`{"error": "..."}` on mid-stream failure. The `text` field lets a client align
on-screen highlighting to the audio. An empty `text` or an unknown `voice`
returns `400`.

Available voices: `af_bella`, `af_heart`, `af_sarah`, `af_sky`, `am_echo`,
`am_liam`, `am_michael`.

## Configuration

- `ALLOWED_ORIGINS` — comma-separated CORS origins, e.g.
  `https://example.com,https://app.example.com`. Defaults to `*` (which, per
  the CORS spec, is served without credentials).

## Notes

The default misaki phonemizer occasionally mispronounces names (e.g. "Los
Angeles"). To work around it you can switch to `phonemizer` + `espeak-ng`:

```python
from phonemizer import phonemize

text = "Los Angeles is a sprawling city"
# 'en-us' gives American pronunciation, like the flapped 'T' in "city"
tokens = phonemize(
    text,
    backend="espeak",
    language="en-us",
    preserve_punctuation=True,
    with_stress=True,
)
```
