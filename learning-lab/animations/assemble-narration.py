"""Place validated, uncut speech segments on the film's timeline (PCM mono)."""

import argparse
import array
import json
import wave
from pathlib import Path


def assemble(name):
    repository = Path(__file__).resolve().parents[2]
    manifest = json.loads((Path(__file__).parent / name / "narration.ru.json").read_text(encoding="utf-8"))
    directory = repository / "work/backprop-pilot/narration" / name
    rate = 22050
    samples = array.array("h", [0]) * round(manifest["duration"] * rate)
    previous = 0.0
    for index, segment in enumerate(manifest["segments"]):
        start, end = segment["start"], segment["end"]
        if not previous <= start < end <= manifest["duration"]:
            raise ValueError(f"Invalid segment {name}/{index}")
        with wave.open(str(directory / f"{index:02}.wav"), "rb") as source:
            if (source.getnchannels(), source.getsampwidth(), source.getframerate()) != (1, 2, rate):
                raise ValueError("Expected 22.05 kHz 16-bit mono speech")
            speech = array.array("h", source.readframes(source.getnframes()))
        if len(speech) > round((end - start - 0.05) * rate):
            raise ValueError(f"Speech would be cut at {name}/{index}")
        offset = round(start * rate)
        samples[offset:offset + len(speech)] = speech
        previous = end
    with wave.open(str(directory / "narration.wav"), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        output.writeframes(samples.tobytes())
    print(f"{name}: {len(samples) / rate:g}s, peak {max(abs(value) for value in samples)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scenes", nargs="+")
    for name in parser.parse_args().scenes:
        assemble(name)
