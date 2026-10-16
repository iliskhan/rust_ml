"""Verify silent MP4 dimensions, duration and track inventory without external tools."""

import hashlib
import argparse
import json
import math
import struct
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = ("backprop", "neuron", "attention", "descent", "xor", "rope", "heads", "generation")


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
    if "vide" not in tracks:
        raise ValueError("MP4 requires a video track")
    return tracks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('scenes', nargs='*', default=list(NAMES))
    parser.add_argument('--output', type=Path, default=ROOT / 'learning-lab/evidence/animation-expansion-2026-10-16/media-verification.json')
    args = parser.parse_args()
    results = []
    for name in args.scenes:
        if not name.isascii() or not name.isalpha() or not name.islower():
            raise ValueError(f'Invalid scene name: {name}')
        path = ROOT / "learning-lab/public/animations" / name / f"{name}.mp4"
        raw = path.read_bytes()
        tracks = media_info(raw)
        if 'soun' in tracks:
            raise ValueError(f"Unexpected audio track in silent lesson: {name}")
        manifest = json.loads((ROOT / 'learning-lab/animations' / name / 'narration.ru.json').read_text(encoding='utf-8'))
        expected = manifest['duration']
        video = tracks["vide"]
        if (video["width"], video["height"]) != (1280, 720):
            raise ValueError(f"Unexpected video dimensions: {name}: {video}")
        duration_tolerance = 2 / 30 + 1e-6
        if not (video["encoded_samples"] > 0
                and math.isclose(video["duration_seconds"], expected, abs_tol=duration_tolerance)):
            raise ValueError(f"Unexpected video duration: {name}: {video}")
        results.append({
            "name": name, "path": path.relative_to(ROOT).as_posix(),
            "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "video": video, "audio_track": None,
            "source_duration_seconds": expected,
            "duration_delta_seconds": video["duration_seconds"] - expected,
            "duration_tolerance_seconds": duration_tolerance,
        })
    revision = subprocess.check_output(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "rev-parse", "HEAD"],
        cwd=ROOT, text=True).strip()
    report = {"checked_at_utc": datetime.now(timezone.utc).isoformat(),
              "checkout": str(ROOT), "revision": revision,
              "python": sys.version.split()[0], "manimgx": version("manimgx"),
              "command": [sys.executable, *sys.argv],
              "results": results}
    output = args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for result in results:
        print(f"{result['name']:10} {result['video']['duration_seconds']:5.2f}s silent")
    print(f"Saved {output}")


if __name__ == "__main__":
    main()
