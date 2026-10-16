"""Small shared drawing helpers; each topic authors its own causal geometry."""
import manimgx as m

m.config.background_color = "#0B0E14"
INK, MUTED, BLUE, GOLD, GREEN, PURPLE = "#F0ECE2", "#89929F", "#72D8EE", "#F2C66D", "#8FD6A3", "#B3A0E0"


def text(words, x=0, y=0, size=34, color=INK):
    return m.Text(str(words), font="Georgia", font_size=size, color=color).move_to([x, y, 0])


def formula(words, x=0, y=0, size=65, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


def vector(values, digits=2):
    return "[" + ", ".join(f"{v:.{digits}f}" for v in values) + "]"


def arrow(start, end, color=GOLD):
    return m.Arrow([*start, 0], [*end, 0], buff=.10, stroke_width=4, color=color)


def clear(scene, *objects, seconds=.5):
    scene.play(*(m.FadeOut(obj) for obj in objects), run_time=seconds)
