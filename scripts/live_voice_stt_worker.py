#!/usr/bin/env python3
"""
Local Persistent Faster-Whisper HTTP Worker for Vintage Vibes Live Voice Price Detection.
Runs strictly on loopback 127.0.0.1:3099 inside C:\\vintage-vibe\\.venv.
Loads 16kHz mono PCM WAV directly into numpy float32 (zero PyAV dependency) for ~250ms transcription.
"""
import json
import os
import sys
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
import numpy as np
from faster_whisper import WhisperModel

PORT = int(os.environ.get("VV_VOICE_STT_PORT", "3099"))
MODEL_NAME = os.environ.get("VV_WHISPER_MODEL", "base")

INITIAL_PROMPT = (
    "Live thrift clothing sale in UAE Dirhams AED. "
    "Common prices: 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 150. "
    "Tagalog and English: trenta, trenta y singko, kwarenta, singkwenta, sisenta, "
    "dirhams, AED, polo shirt, t-shirt, jacket, hoodie, cap, jeans, Carhartt, Lacoste, Ralph Lauren, Levi's, Hugo Boss, Nike."
)


def load_wav_16k_mono(wav_path: str) -> np.ndarray:
    with wave.open(wav_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())

    if sampwidth == 2:
        audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 1:
        audio = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        audio = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2147483648.0

    if n_channels > 1:
        audio = audio.reshape(-1, n_channels).mean(axis=1)

    if framerate != 16000 and len(audio) > 0:
        target_len = int(round(len(audio) * 16000.0 / float(framerate)))
        audio = np.interp(
            np.linspace(0, len(audio) - 1, target_len),
            np.arange(len(audio)),
            audio,
        ).astype(np.float32)

    return audio


print(f"[VoiceSTT] Loading faster-whisper model '{MODEL_NAME}' (int8)...", flush=True)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=4)
print(f"[VoiceSTT] Ready on http://127.0.0.1:{PORT}", flush=True)


class SttHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_json(self, status: int, payload: dict):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send_json(200, {"ok": True, "model": MODEL_NAME})
        else:
            self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if not self.path.startswith("/transcribe"):
            self._send_json(404, {"ok": False, "error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
            wav_path = str(body.get("wavPath") or "").strip()
            if not wav_path or not os.path.isfile(wav_path):
                self._send_json(400, {"ok": False, "error": "wavPath missing"})
                return

            audio_np = load_wav_16k_mono(wav_path)
            segments, info = model.transcribe(
                audio_np,
                beam_size=2,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=250),
                initial_prompt=INITIAL_PROMPT,
                condition_on_previous_text=False,
            )
            texts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
            full_text = " ".join(texts).strip()
            self._send_json(
                200,
                {
                    "ok": True,
                    "text": full_text,
                    "language": getattr(info, "language", ""),
                },
            )
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), SttHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
