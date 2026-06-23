# kokoro-server

A small [FastAPI](https://fastapi.tiangolo.com/) server that exposes the
[Kokoro](https://github.com/hexgrad/kokoro) text-to-speech model over HTTP.
Send it text, get back MP3 audio. Configured for **American English** only.

## Requirements

- Python >= 3.12
- [uv](https://docs.astral.sh/uv/)
- `ffmpeg` (required by `pydub` to encode MP3)

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
(`http://localhost:18001/tts`); change it only if you also update the
extension.

The model is loaded lazily on the **first** `/tts` request, so the first
response is noticeably slower than the ones that follow.

## API

### `POST /tts`

Request body:

```json
{ "text": "Hello from Kokoro", "voice": "af_bella" }
```

Response: an `audio/mp3` stream. An empty `text` or an unknown `voice` returns
`400`.

Available voices: `af_bella`, `af_heart`, `af_sarah`, `af_sky`, `am_echo`,
`am_liam`, `am_michael`.

Example:

```bash
curl -X POST http://localhost:18001/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Kokoro", "voice": "af_bella"}' \
  --output out.mp3
```

### `POST /tts/stream`

Same request body as `/tts`. Streams audio as it is generated for low-latency
playback of long text: an `application/x-ndjson` response with one JSON line
per chunk — `{"sr": 24000, "index": i, "pcm_b64": "<base64 Int16 mono PCM>"}` —
terminated by `{"done": true}`, or `{"error": "..."}` on mid-stream failure.

## Configuration

- `ALLOWED_ORIGINS` — comma-separated CORS origins, e.g.
  `https://example.com,https://app.example.com`. Defaults to `*` (which, per
  the CORS spec, is served without credentials).
- `VOLUME_GAIN` in `kokoro_model.py` — output volume boost. The gain is
  `tanh` soft-limited, so higher values get genuinely louder before saturating
  rather than hard-clipping. Tune to taste.

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
