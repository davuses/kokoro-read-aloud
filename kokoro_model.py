import warnings

import numpy as np
from kokoro import KModel, KPipeline

# Suppress all warnings
warnings.filterwarnings("ignore")


def adjust_volume(audio: np.ndarray, gain: float) -> np.ndarray:
    """Adjust audio volume by a gain factor, avoid clipping."""
    audio = audio * gain
    max_val = np.max(np.abs(audio))
    if max_val > 1.0:
        audio = audio / max_val
    return audio


class KokoroModel:
    def __init__(self, lang_code="a", voice="am_michael.pt"):
        # Initialize the TTS pipeline (only once)
        kmodel = KModel(
            config="model_config.json",
            model="kokoro-v1_0.pth",
            repo_id="hexgrad/Kokoro-82M",
        )
        self.pipeline = KPipeline(
            repo_id="hexgrad/Kokoro-82M",
            lang_code=lang_code,
            model=kmodel,
            device="cuda",
        )
        self.voice = voice

    def generate_audio(self, text, speed=1, split_pattern=r"\n+"):
        # Generate the audio based on the given text
        generator = self.pipeline(
            text, voice=self.voice, speed=speed, split_pattern=split_pattern
        )

        # Accumulate all audio chunks in a list
        audio_chunks = []
        for i, (gs, ps, audio) in enumerate(generator):
            audio_chunks.append(audio)  # Add each audio chunk to the list

        # Concatenate all audio chunks into one array
        if len(audio_chunks) > 0:
            audio_output = np.concatenate(audio_chunks)
        else:
            raise ValueError("Failed to generate audio")
        audio_output = adjust_volume(audio_output, 3)
        return audio_output


# Singleton instance of the model
kokoro_model = KokoroModel()
