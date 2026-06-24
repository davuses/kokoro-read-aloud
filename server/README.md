# kokoro-server

A small [FastAPI](https://fastapi.tiangolo.com/) server that exposes the
[Kokoro](https://github.com/hexgrad/kokoro) text-to-speech model over HTTP.
Send it text, get audio streamed back as it is generated. Offers **American
English** (the recommended, higher-quality voices) and **British English**
voices, with an adjustable speech rate.

It pairs with the companion [browser extension](../extension), which streams from
this server (default `http://localhost:18001`) — but the HTTP API is usable on
its own.

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

Both pipelines (American and British) are pre-warmed at **startup**, so startup
takes a little longer but every request — including the first, and the first
British one — runs at full speed. If pre-warming fails it's logged and the
model falls back to loading lazily on first use.

## Deployment

For others deploying this, the whole story is `uv` — there is **no Dockerfile by
design**:

- **GPU:** install a recent **NVIDIA driver**, then `uv sync`. You do *not* need a
  system CUDA toolkit — the PyTorch wheel bundles the CUDA runtime. The model uses
  the GPU automatically when `torch.cuda.is_available()`.
- **CPU:** no driver needed; it falls back to CPU automatically (slower, but
  works).
- **First run** downloads the Kokoro weights (~hundreds of MB), so the machine
  needs network access and a little disk on first use.
- **Optional:** the phonemizer workaround in [Notes](#notes) needs `espeak-ng`
  (`apt install espeak-ng`); the default path does not.

### Security

There is **no authentication or rate limiting** — anyone who can reach the port
can use your GPU. The `--host 0.0.0.0` in the example above exposes the server to
your whole network; bind to `127.0.0.1` instead if only the local machine (and
the extension) should reach it:

```bash
uv run uvicorn server:app --host 127.0.0.1 --port 18001
```

Requests are capped at 50,000 characters to keep a single call from holding the
inference lock indefinitely. If you expose this beyond a trusted network, put it
behind a reverse proxy that adds auth/rate limits and set `ALLOWED_ORIGINS`.

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
{
  "voices": [
    "af_bella", "af_heart", "af_sarah", "af_sky", "am_echo", "am_liam", "am_michael",
    "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis"
  ]
}
```

Cheap to call: it does not load the model.

### `POST /tts/stream`

Request body:

```json
{ "text": "Hello from Kokoro", "voice": "af_bella", "speed": 1.0 }
```

`speed` is optional (default `1.0`, range `0.5`–`2.0`; out-of-range values
return `422`). Streams audio as it is generated for low-latency playback of long
text: an `application/x-ndjson` response with one JSON line per chunk —
`{"sr": 24000, "index": i, "pcm_b64": "<base64 Int16 mono PCM>", "text": "<the
grapheme text of this chunk>"}` — terminated by `{"done": true}`, or
`{"error": "..."}` on mid-stream failure. The `text` field lets a client align
on-screen highlighting to the audio. An empty `text` or an unknown `voice`
returns `400`.

Available voices: American English (recommended) — `af_bella`, `af_heart`,
`af_sarah`, `af_sky`, `am_echo`, `am_liam`, `am_michael`; British English —
`bf_alice`, `bf_emma`, `bf_isabella`, `bf_lily`, `bm_daniel`, `bm_fable`,
`bm_george`, `bm_lewis`.

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

## License

[Apache-2.0](../LICENSE). The Kokoro model itself is also Apache-2.0.
