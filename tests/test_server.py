"""Tests for the kokoro-server HTTP API.

These do not load the real Kokoro model: the streaming test monkeypatches
``stream_audio`` to yield fake PCM, so the suite runs on CPU-only / GPU-less
machines (e.g. CI) in milliseconds.
"""

import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

import kokoro_model
from server import app

client = TestClient(app)


def test_voices_lists_allowed_voices():
    resp = client.get("/voices")
    assert resp.status_code == 200
    voices = resp.json()["voices"]
    assert voices == kokoro_model.kokoro_model.ALLOWED_VOICES
    assert "af_bella" in voices


def test_stream_empty_text_returns_400():
    resp = client.post("/tts/stream", json={"text": "", "voice": "af_bella"})
    assert resp.status_code == 400


def test_stream_unknown_voice_returns_400():
    resp = client.post(
        "/tts/stream", json={"text": "hello", "voice": "no_such_voice"}
    )
    assert resp.status_code == 400


def test_stream_emits_ndjson_chunks_then_done(monkeypatch):
    # Two ~10ms chunks of silence; never touches torch/the real pipeline.
    def fake_stream(text, voice, **kwargs):
        for _ in range(2):
            yield np.zeros(240, dtype=np.float32)

    monkeypatch.setattr(
        kokoro_model.kokoro_model, "stream_audio", fake_stream
    )

    resp = client.post(
        "/tts/stream", json={"text": "hello", "voice": "af_bella"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/x-ndjson")

    lines = [json.loads(l) for l in resp.text.splitlines() if l]
    *chunks, last = lines
    assert last == {"done": True}
    assert len(chunks) == 2
    for i, chunk in enumerate(chunks):
        assert chunk["sr"] == kokoro_model.SAMPLE_RATE
        assert chunk["index"] == i
        assert chunk["pcm_b64"]


def test_stream_reports_generation_error_in_band(monkeypatch):
    def boom(text, voice, **kwargs):
        raise RuntimeError("kaboom")
        yield  # make it a generator

    monkeypatch.setattr(kokoro_model.kokoro_model, "stream_audio", boom)

    resp = client.post(
        "/tts/stream", json={"text": "hello", "voice": "af_bella"}
    )
    # Status is already 200 by the time generation fails, so the error is
    # reported in-band as the final NDJSON line.
    assert resp.status_code == 200
    last = json.loads(resp.text.splitlines()[-1])
    assert "error" in last
