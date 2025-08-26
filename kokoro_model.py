import logging
import time
import warnings

import numpy as np
from kokoro import KPipeline

# Suppress all warnings
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO)  # noqa: F821
logger = logging.getLogger(__name__)


def adjust_volume(audio: np.ndarray, gain: float) -> np.ndarray:
    """Adjust audio volume by a gain factor, avoid clipping."""
    audio = audio * gain
    max_val = np.max(np.abs(audio))
    if max_val > 1.0:
        audio = audio / max_val
    return audio


class KokoroModel:
    ALLOWED_VOICES = [
        "af_bella",
        "af_heart",
        "af_sarah",
        "af_sky",
        "am_echo",
        "am_liam",
        "am_michael",
        "bf_alice",
        "bf_lily",
    ]

    def __init__(self, lang_code="a"):
        # Initialize the TTS pipeline (only once)
        import torch

        if torch.cuda.is_available():
            logger.info("GPU found, loading model on GPU")
        self.pipeline = KPipeline(
            lang_code=lang_code
        )  # make sure lang_code matches voice

    def generate_audio(
        self, text: str, voice: str, speed=1, split_pattern=r"\n+"
    ):
        if voice not in self.ALLOWED_VOICES:
            voice = self.ALLOWED_VOICES[0]

        generator = self.pipeline(
            text, voice=voice, speed=speed, split_pattern=split_pattern
        )
        # Accumulate all audio chunks in a list
        audio_chunks = []
        starttime = time.time()
        for i, (gs, ps, audio) in enumerate(generator):
            audio_chunks.append(audio)  # Add each audio chunk to the list
        endtime = time.time()
        logger.info(f"Time taken: {endtime - starttime:.2f} seconds")
        # Concatenate all audio chunks into one array
        if len(audio_chunks) > 0:
            audio_output = np.concatenate(audio_chunks)
        else:
            raise ValueError("Failed to generate audio")
        audio_output = adjust_volume(audio_output, 3)
        return audio_output


# Singleton instance of the model
kokoro_model = KokoroModel()
