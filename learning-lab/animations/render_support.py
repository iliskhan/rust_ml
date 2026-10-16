"""Render one narrated lesson with native ManimGX audio and a matching poster."""

from pathlib import Path

import manimgx as m
from PIL import Image


def render_scene(scene_type, name, poster_second):
    repository = Path(__file__).resolve().parents[2]
    output = repository / "learning-lab/public/animations" / name
    narration = repository / "work/backprop-pilot/narration" / name / "narration.wav"
    if not narration.is_file():
        raise FileNotFoundError(f"Generate narration first: {narration}")
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

    class Narrated(scene_type):
        def setup(self):
            super().setup()
            self.add_sound(narration)

    film = Narrated().render(output / f"{name}.mp4", frames=keep_poster)
    if not written:
        raise RuntimeError(f"Missing poster frame at {poster_second}s")
    sound = film.soundtrack()
    if sound is None or not (abs(sound) > 0.001).any():
        raise RuntimeError("The rendered film has no audible soundtrack")
    print(f"Rendered {name}: {film.frame_count} frames, {sound.shape[0]} audio samples; poster {poster_second}s")
