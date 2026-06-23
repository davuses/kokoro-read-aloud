import logging
import warnings

import numpy as np

# Suppress all warnings
warnings.filterwarnings("ignore")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Native sample rate of the Kokoro model output.
SAMPLE_RATE = 24000


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
        # lazily on the first stream_audio call, not at import/startup.
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
        """Yield float32 audio chunks as they are generated.

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
            yield np.asarray(audio, dtype=np.float32)


# Singleton instance of the model
kokoro_model = KokoroModel()
