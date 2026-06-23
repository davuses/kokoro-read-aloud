import asyncio
import base64
import io
import json
import logging
import os
import threading

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request
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


async def _tts_kokoro(text: str, voice: str) -> bytes:
    # Importing kokoro_model is cheap (the model loads lazily on first use),
    # so we can validate the voice and reject bad ones without loading it.
    from kokoro_model import kokoro_model

    if voice not in kokoro_model.ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown voice. Allowed: {kokoro_model.ALLOWED_VOICES}",
        )

    # Kokoro uses one shared GPU pipeline: serialize with the lock and run the
    # blocking inference off the event loop.
    async with _inference_lock:
        return await run_in_threadpool(_synthesize, text, voice)


@app.post("/tts")
async def tts(request: TextRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="No text provided")

    mp3_bytes = await _tts_kokoro(request.text, request.voice)
    return StreamingResponse(io.BytesIO(mp3_bytes), media_type="audio/mp3")


@app.post("/tts/stream")
async def tts_stream(body: TextRequest, request: Request):
    """Stream Kokoro audio as it is generated, one NDJSON line per chunk.

    Each line is a JSON object:
      {"sr": 24000, "index": i, "pcm_b64": "<base64 Int16 mono PCM>"}
    terminated by {"done": true}, or {"error": "..."} if generation fails
    mid-stream (the HTTP status is already 200 by then, so failures are
    reported in-band).
    """
    from kokoro_model import SAMPLE_RATE, kokoro_model

    if not body.text:
        raise HTTPException(status_code=400, detail="No text provided")
    if body.voice not in kokoro_model.ALLOWED_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown voice. Allowed: {kokoro_model.ALLOWED_VOICES}",
        )

    async def ndjson():
        # Hold the GPU lock for the whole stream. Generation runs ~20x faster
        # than playback, so the producer races ahead, drains into the queue,
        # and the lock is released long before the client finishes playing.
        async with _inference_lock:
            loop = asyncio.get_running_loop()
            queue: asyncio.Queue = asyncio.Queue()
            cancel = threading.Event()
            DONE = object()

            def produce():
                try:
                    for chunk in kokoro_model.stream_audio(body.text, body.voice):
                        if cancel.is_set():
                            break
                        loop.call_soon_threadsafe(queue.put_nowait, chunk)
                    loop.call_soon_threadsafe(queue.put_nowait, DONE)
                except Exception as exc:  # surfaced as an in-band error line
                    logger.exception("Kokoro streaming generation failed")
                    loop.call_soon_threadsafe(queue.put_nowait, exc)

            fut = loop.run_in_executor(None, produce)
            index = 0
            try:
                while True:
                    # Stop generating if the client went away (closed player).
                    if await request.is_disconnected():
                        break
                    item = await queue.get()
                    if item is DONE:
                        yield json.dumps({"done": True}) + "\n"
                        break
                    if isinstance(item, Exception):
                        yield json.dumps({"error": str(item)}) + "\n"
                        break
                    pcm16 = (np.clip(item, -1.0, 1.0) * 32767).astype("<i2").tobytes()
                    yield json.dumps(
                        {
                            "sr": SAMPLE_RATE,
                            "index": index,
                            "pcm_b64": base64.b64encode(pcm16).decode("ascii"),
                        }
                    ) + "\n"
                    index += 1
            finally:
                # Signal the worker to stop and wait for it to actually exit
                # before releasing the lock, so the next request can't start GPU
                # work while this generation is still finishing its last chunk.
                # Loop through cancellation: if this coroutine is itself being
                # cancelled, keep waiting until the worker thread is really done.
                cancel.set()
                while not fut.done():
                    try:
                        await asyncio.shield(fut)
                    except asyncio.CancelledError:
                        pass

    return StreamingResponse(ndjson(), media_type="application/x-ndjson")
