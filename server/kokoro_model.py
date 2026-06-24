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
    # Voices grouped by accent. The first letter of each name is its Kokoro
    # lang_code: "a" = American English, "b" = British English. American voices
    # are the higher-quality, recommended set; British voices are offered as an
    # option but sound less natural. Each lang_code needs its own pipeline (the
    # G2P/phonemizer differs), so a voice can't be played through the wrong one.
    ALLOWED_VOICES = [
        "af_bella",
        "af_heart",
        "af_sarah",
        "af_sky",
        "am_echo",
        "am_liam",
        "am_michael",
        "bf_alice",
        "bf_emma",
        "bf_isabella",
        "bf_lily",
        "bm_daniel",
        "bm_fable",
        "bm_george",
        "bm_lewis",
    ]

    def __init__(self):
        # One pipeline per lang_code, built lazily on first use. The heavy
        # torch/kokoro imports happen on the first stream_audio call, not at
        # import/startup, and a British pipeline is only loaded if a British
        # voice is actually requested.
        self.pipelines = {}

    def lang_codes(self):
        """The distinct lang_codes spanned by ALLOWED_VOICES (e.g. {"a", "b"})."""
        return sorted({voice[0] for voice in self.ALLOWED_VOICES})

    def preload(self):
        """Build every pipeline now instead of lazily on first use.

        Called at server startup to pre-warm both the American and British
        pipelines, so the first request (and the first British request in
        particular) doesn't pay the one-time model-load cost.
        """
        for lang_code in self.lang_codes():
            self._ensure_pipeline(lang_code)

    def _ensure_pipeline(self, lang_code):
        pipeline = self.pipelines.get(lang_code)
        if pipeline is None:
            import torch
            from kokoro import KPipeline

            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Loading %r pipeline on %s", lang_code, device)
            pipeline = KPipeline(lang_code=lang_code, device=device)
            self.pipelines[lang_code] = pipeline
        return pipeline

    def stream_audio(self, text: str, voice: str, speed: float = 1.0):
        """Yield ``(text, audio)`` pairs as they are generated.

        Kokoro's pipeline yields one chunk per <=510-token (sentence-grouped)
        piece, so this starts producing audio after the first sentence rather
        than the whole text. Each yield is the grapheme text of that chunk
        paired with its float32 audio, so the client can align highlighting to
        the audio. ``speed`` scales the playback rate (1.0 = natural). Used by
        the streaming endpoint.
        """
        if voice not in self.ALLOWED_VOICES:
            raise ValueError(f"Unknown voice: {voice!r}")
        # The first letter of the voice name is its lang_code ("a" American,
        # "b" British); pick (and lazily build) the matching pipeline.
        pipeline = self._ensure_pipeline(voice[0])
        # Split on blank lines so each chunk is a sentence-grouped piece.
        generator = pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+")
        for graphemes, _, audio in generator:
            if audio is None:
                continue
            yield graphemes, np.asarray(audio, dtype=np.float32)


# Singleton instance of the model
kokoro_model = KokoroModel()
