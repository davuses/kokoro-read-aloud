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

    def stream_audio(
        self, text: str, voice: str, speed=1, split_pattern=r"\n+"
    ):
        """Yield volume-adjusted float32 audio chunks as they are generated.

        Kokoro's pipeline yields one chunk per <=510-token (sentence-grouped)
        piece, so this starts producing audio after the first sentence rather
        than the whole text. Used by the streaming endpoint.
        """
        if voice not in self.ALLOWED_VOICES:
            raise ValueError(f"Unknown voice: {voice!r}")
        pipeline = self._ensure_pipeline()
        generator = pipeline(
            text, voice=voice, speed=speed, split_pattern=split_pattern
        )
        for _, _, audio in generator:
            if audio is None:
                continue
            yield adjust_volume(np.asarray(audio, dtype=np.float32), VOLUME_GAIN)

    def generate_audio(
        self, text: str, voice: str, speed=1, split_pattern=r"\n+"
    ):
        starttime = time.time()
        # Reuse the streaming generator and concatenate for the buffered path.
        audio_chunks = list(
            self.stream_audio(text, voice, speed=speed, split_pattern=split_pattern)
        )
        logger.info(f"Time taken: {time.time() - starttime:.2f} seconds")
        if not audio_chunks:
            raise ValueError("Failed to generate audio")
        return np.concatenate(audio_chunks)


# Singleton instance of the model
kokoro_model = KokoroModel()
