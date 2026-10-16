"""Render MP4 and poster through the same FrameSink as the backprop pilot."""

from pathlib import Path

import manimgx as m
from PIL import Image

from attention import AttentionMixture


def main():
    output = Path(__file__).resolve().parents[2] / "public/animations/attention"
    output.mkdir(parents=True, exist_ok=True)
    m.config.pixel_width, m.config.pixel_height = 1280, 720
    m.config.frame_rate = 30
    poster_frame = 40 * m.config.frame_rate
    poster_written = False

    def keep_poster(frame):
        nonlocal poster_written
        if not poster_written and frame.index <= poster_frame < frame.index + frame.repeat:
            Image.frombytes("RGBA", (1280, 720), frame.pixels()).convert("RGB").save(output / "poster.png")
            poster_written = True

    AttentionMixture().render(output / "attention.mp4", frames=keep_poster)
    if not poster_written:
        raise RuntimeError("The scene ended before the poster frame at 40 seconds")
    print(f"Rendered {output / 'attention.mp4'} and poster.png (40 s)")


if __name__ == "__main__":
    main()
