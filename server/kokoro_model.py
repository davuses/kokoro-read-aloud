import logging
import warnings

import numpy as np

# Kokoro/torch are noisy with UserWarning/FutureWarning on load (deprecated
# APIs, weight-norm notices). Silence just those categories rather than every
# warning process-wide, so genuine warnings still surface.
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

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

    def stream_audio(self, text: str, voice: str):
        """Yield ``(text, audio)`` pairs as they are generated.

        Kokoro's pipeline yields one chunk per <=510-token (sentence-grouped)
        piece, so this starts producing audio after the first sentence rather
        than the whole text. Each yield is the grapheme text of that chunk
        paired with its float32 audio, so the client can align highlighting to
        the audio. Used by the streaming endpoint.
        """
        if voice not in self.ALLOWED_VOICES:
            raise ValueError(f"Unknown voice: {voice!r}")
        pipeline = self._ensure_pipeline()
        # Split on blank lines so each chunk is a sentence-grouped piece.
        generator = pipeline(text, voice=voice, split_pattern=r"\n+")
        for graphemes, _, audio in generator:
            if audio is None:
                continue
            yield graphemes, np.asarray(audio, dtype=np.float32)


# Singleton instance of the model
kokoro_model = KokoroModel()
