"""Render a silent visual lesson and its matching poster with native ManimGX."""

from pathlib import Path

import manimgx as m
from PIL import Image


def render_scene(scene_type, name, poster_second):
    repository = Path(__file__).resolve().parents[2]
    output = repository / "learning-lab/public/animations" / name
    output.mkdir(parents=True, exist_ok=True)
    m.config.pixel_width, m.config.pixel_height = 1280, 720
    m.config.frame_rate = 30
    poster_frame = round(poster_second * m.config.frame_rate)
    written = False

    def keep_poster(frame):
        nonlocal written
        if not written and frame.index <= poster_frame < frame.index + frame.repeat:
            Image.frombytes("RGBA", (1280, 720), frame.pixels()).convert("RGB").save(output / "poster.png")
            written = True

    film = scene_type().render(output / f"{name}.mp4", frames=keep_poster)
    if not written:
        raise RuntimeError(f"Missing poster frame at {poster_second}s")
    if film.soundtrack() is not None:
        raise RuntimeError("Visual lessons must not contain an audio track")
    print(f"Rendered {name}: {film.frame_count} frames; silent; poster {poster_second}s")
