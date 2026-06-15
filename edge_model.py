"""Microsoft Edge online TTS engine (https://github.com/rany2/edge-tts).

Unlike the Kokoro engine this is a network call to Microsoft's service: it is
fully async, needs no GPU/model, returns MP3 directly, and is safe to run
concurrently (so it doesn't share Kokoro's inference lock).
"""

import edge_tts

# Curated American-English neural voices offered by the server. The full list
# is available via `edge_tts.list_voices()`; these are kept in sync with the
# options shown in the browser extension's popup.
ALLOWED_VOICES = [
    "en-US-AvaNeural",
    "en-US-AndrewNeural",
    "en-US-EmmaNeural",
    "en-US-BrianNeural",
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-AriaNeural",
    "en-US-MichelleNeural",
]


async def generate_mp3(text: str, voice: str) -> bytes:
    """Synthesize ``text`` with Edge TTS and return the MP3 bytes."""
    communicate = edge_tts.Communicate(text, voice)
    chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    if not chunks:
        raise ValueError("Failed to generate audio")
    return b"".join(chunks)
