"""Verify the eight rendered MP4s without external media tools."""

import hashlib
import json
import math
import struct
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

import numpy as np
from manimgx._engine import decode_audio


ROOT = Path(__file__).resolve().parents[2]
NAMES = ("backprop", "neuron", "attention", "descent", "xor", "rope", "heads", "generation")
RATE = 22050


def boxes(data):
    offset = 0
    while offset < len(data):
        if len(data) - offset < 8:
            raise ValueError("Truncated MP4 box header")
        size, kind = struct.unpack_from(">I4s", data, offset)
        header = 8
        if size == 1:
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            raise ValueError(f"Invalid MP4 box {kind!r}")
        yield kind, data[offset + header : offset + size]
        offset += size


def box(data, kind):
    return next(payload for name, payload in boxes(data) if name == kind)


def media_info(raw):
    moov = box(memoryview(raw), b"moov")
    tracks = {}
    for name, trak in boxes(moov):
        if name != b"trak":
            continue
        mdia = box(trak, b"mdia")
        kind = bytes(box(mdia, b"hdlr")[8:12]).decode("ascii")
        mdhd = box(mdia, b"mdhd")
        if mdhd[0] == 0:
            scale, duration = struct.unpack_from(">II", mdhd, 12)
        elif mdhd[0] == 1:
            scale, duration = struct.unpack_from(">IQ", mdhd, 20)
        else:
            raise ValueError("Unknown mdhd version")
        info = {"duration_seconds": duration / scale}
        if kind == "vide":
            tkhd = box(trak, b"tkhd")
            width, height = struct.unpack_from(">II", tkhd, len(tkhd) - 8)
            stts = box(box(box(mdia, b"minf"), b"stbl"), b"stts")
            count = struct.unpack_from(">I", stts, 4)[0]
            frames = sum(struct.unpack_from(">I", stts, 8 + i * 8)[0] for i in range(count))
            info.update(width=width / 65536, height=height / 65536,
                        encoded_samples=frames,
                        average_encoded_fps=frames / info["duration_seconds"])
        tracks[kind] = info
    if "vide" not in tracks or "soun" not in tracks:
        raise ValueError("MP4 requires video and sound tracks")
    return tracks


def main():
    results = []
    for name in NAMES:
        path = ROOT / "learning-lab/public/animations" / name / f"{name}.mp4"
        raw = path.read_bytes()
        tracks = media_info(raw)
        pcm, channels = decode_audio(raw, RATE)
        samples = np.frombuffer(pcm, dtype=np.float32)
        if not channels or len(samples) % channels:
            raise ValueError(f"Invalid decoded audio: {name}")
        duration = len(samples) / channels / RATE
        peak = float(np.max(np.abs(samples)))
        rms = float(np.sqrt(np.mean(np.square(samples.astype(np.float64)))))
        expected = 44 if name in ("backprop", "neuron") else 50
        video = tracks["vide"]
        if (video["width"], video["height"]) != (1280, 720):
            raise ValueError(f"Unexpected video dimensions: {name}: {video}")
        if not (video["encoded_samples"] > 0
                and math.isclose(video["duration_seconds"], expected, abs_tol=0.05)):
            raise ValueError(f"Unexpected video duration: {name}: {video}")
        if not (abs(duration - expected) < 0.05
                and np.isfinite(samples).all() and peak > 0.001 and rms > 0.001):
            raise ValueError(f"Invalid audio/video metrics: {name}")
        results.append({
            "name": name, "path": path.relative_to(ROOT).as_posix(),
            "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "video": video, "audio_track": tracks["soun"],
            "decoded_audio": {"sample_rate_hz": RATE, "channels": channels,
                              "samples_per_channel": len(samples) // channels,
                              "duration_seconds": duration, "peak": peak, "rms": rms},
        })
    revision = subprocess.check_output(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"],
        cwd=ROOT, text=True).strip()
    report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(),
              "checkout": str(ROOT), "revision": revision,
              "python": sys.version.split()[0], "manimgx": version("manimgx"),
              "command": "work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/verify-media.py",
              "results": results}
    output = ROOT / "learning-lab/evidence/animation-expansion-2026-10-16/media-verification.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for result in results:
        audio = result["decoded_audio"]
        print(f"{result['name']:10} {result['video']['duration_seconds']:5.2f}s "
              f"audio {audio['duration_seconds']:5.2f}s peak {audio['peak']:.3f} rms {audio['rms']:.3f}")
    print(f"Saved {output}")


if __name__ == "__main__":
    main()
