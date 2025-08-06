import io
import logging

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
gpu_available = False

if torch.cuda.is_available():
    gpu_available = True


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],  # Allow all headers
)


class TextRequest(BaseModel):
    text: str


@app.post("/tts")
async def tts(request: TextRequest):
    text = request.text

    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    if gpu_available:
        logger.info("Loading GPU model...")
        from kokoro_model import kokoro_model

        audio_output = kokoro_model.generate_audio(text)  # type: ignore
        audio_io_wav = io.BytesIO()
        sf.write(audio_io_wav, audio_output, 24000, format="WAV")
        audio_io_wav.seek(0)

        audio = AudioSegment.from_wav(audio_io_wav)
        mp3_io = io.BytesIO()
        audio.export(mp3_io, format="mp3")
        mp3_io.seek(0)

        return StreamingResponse(mp3_io, media_type="audio/mp3")
    else:
        print("GPU not available, cannot process request")
        raise HTTPException(
            status_code=503, detail="Service not available, GPU not found"
        )
