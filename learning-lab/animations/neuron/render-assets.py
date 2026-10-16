"""Render the neuron video and poster using the same ManimGX frame sink."""

from pathlib import Path

import manimgx as m
from PIL import Image

from neuron import NeuronActivation


def main():
    output = Path(__file__).resolve().parents[2] / "public/animations/neuron"
    output.mkdir(parents=True, exist_ok=True)
    m.config.pixel_width, m.config.pixel_height = 1280, 720
    m.config.frame_rate = 30
    poster_frame = 34 * m.config.frame_rate
    poster_written = False

    def keep_poster(frame):
        nonlocal poster_written
        if not poster_written and frame.index <= poster_frame < frame.index + frame.repeat:
            Image.frombytes("RGBA", (1280, 720), frame.pixels()).convert("RGB").save(output / "poster.png")
            poster_written = True

    NeuronActivation().render(output / "neuron.mp4", frames=keep_poster)
    if not poster_written:
        raise RuntimeError("The scene ended before the poster frame at 34 seconds")
    print(f"Rendered {output / 'neuron.mp4'} and poster.png (34 s)")


if __name__ == "__main__":
    main()
