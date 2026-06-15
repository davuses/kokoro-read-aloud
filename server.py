import asyncio
import io
import logging
import os

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI()

# Comma-separated list of allowed origins, e.g.
# ALLOWED_ORIGINS="https://example.com,https://app.example.com".
# A wildcard with credentials is rejected by browsers, so we don't combine
# them: default to allowing any origin *without* credentials.
_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
allowed_origins = [
    o.strip() for o in _origins_env.split(",") if o.strip()
] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# The Kokoro pipeline holds a single model instance and is not safe to run
# concurrently, so serialize inference with a lock. Each request still runs
# off the event loop (in a worker thread) so the server stays responsive.
_inference_lock = asyncio.Lock()


def _synthesize(text: str, voice: str) -> bytes:
    """Run TTS and return MP3 bytes. Blocking; call via run_in_threadpool."""
    from kokoro_model import SAMPLE_RATE, kokoro_model

    audio_output = kokoro_model.generate_audio(text, voice=voice)

    audio_io_wav = io.BytesIO()
    sf.write(audio_io_wav, audio_output, SAMPLE_RATE, format="WAV")
    audio_io_wav.seek(0)

    audio = AudioSegment.from_wav(audio_io_wav)
    mp3_io = io.BytesIO()
    audio.export(mp3_io, format="mp3")
    return mp3_io.getvalue()


class TextRequest(BaseModel):
    text: str
    voice: str
    # "kokoro" (local GPU model) or "edge" (Microsoft Edge online TTS).
    # Defaults to kokoro so existing clients keep working unchanged.
    engine: str = "kokoro"


async def _tts_kokoro(text: str, voice: str) -> bytes:
    # Importing kokoro_model is cheap (the model loads lazily on first use),
    # so we can validate the voice and reject bad ones without loading it.
    from kokoro_model import kokoro_model

    if voice not in kokoro_model.ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown kokoro voice. Allowed: {kokoro_model.ALLOWED_VOICES}",
        )

    # Kokoro uses one shared GPU pipeline: serialize with the lock and run the
    # blocking inference off the event loop.
    async with _inference_lock:
        return await run_in_threadpool(_synthesize, text, voice)


async def _tts_edge(text: str, voice: str) -> bytes:
    import edge_model

    if voice not in edge_model.ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown edge voice. Allowed: {edge_model.ALLOWED_VOICES}",
        )

    # Edge is async network I/O and returns MP3 directly; no lock needed.
    return await edge_model.generate_mp3(text, voice)


@app.post("/tts")
async def tts(request: TextRequest):
    text = request.text
    voice = request.voice
    engine = request.engine

    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    if engine == "kokoro":
        mp3_bytes = await _tts_kokoro(text, voice)
    elif engine == "edge":
        mp3_bytes = await _tts_edge(text, voice)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown engine: {engine!r}. Allowed: 'kokoro', 'edge'.",
        )

    return StreamingResponse(io.BytesIO(mp3_bytes), media_type="audio/mp3")
