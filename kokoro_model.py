import logging
import time
import warnings

import numpy as np

# Suppress all warnings
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Native sample rate of the Kokoro model output.
SAMPLE_RATE = 24000
# Volume boost applied to the raw model output. Values above the [-1, 1]
# range are soft-limited (see adjust_volume), so a higher gain increases
# perceived loudness instead of just clipping.
VOLUME_GAIN = 6.0


def adjust_volume(audio: np.ndarray, gain: float) -> np.ndarray:
    """Boost volume by ``gain``, soft-limiting peaks to avoid hard clipping.

    A plain multiply-then-normalize would peak-normalize every clip back to
    1.0, cancelling out any gain increase. Instead we apply the gain and pass
    the result through ``tanh``, which is near-linear for quiet samples and
    saturates smoothly toward +/-1 for loud ones. This makes the audio
    genuinely louder as ``gain`` rises, with gentle saturation rather than
    abrupt clipping.
    """
    return np.tanh(audio * gain).astype(np.float32)


class KokoroModel:
    # American English voices only (lang_code "a"). British voices would
    # need a pipeline built with lang_code "b", so they are not offered here.
    ALLOWED_VOICES = [
        "af_bella",
        "af_heart",
        "af_sarah",
        "af_sky",
        "am_echo",
        "am_liam",
        "am_michael",
    ]

    def __init__(self, lang_code="a"):
        self.lang_code = lang_code
        # The pipeline (and the heavy torch/kokoro imports it needs) is loaded
        # lazily on the first generate_audio call, not at import/startup.
        self.pipeline = None

    def _ensure_pipeline(self):
        if self.pipeline is None:
            import torch
            from kokoro import KPipeline

            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Loading model on %s", device)
            self.pipeline = KPipeline(
                lang_code=self.lang_code, device=device
            )  # make sure lang_code matches voice
        return self.pipeline

    def generate_audio(
        self, text: str, voice: str, speed=1, split_pattern=r"\n+"
    ):
        if voice not in self.ALLOWED_VOICES:
            raise ValueError(f"Unknown voice: {voice!r}")
        pipeline = self._ensure_pipeline()
        generator = pipeline(
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
        audio_output = adjust_volume(audio_output, VOLUME_GAIN)
        return audio_output


# Singleton instance of the model
kokoro_model = KokoroModel()
