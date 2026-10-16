"""Render the scene with the shared 720p/30 FrameSink and optional narration."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_support import render_scene
from heads import AttentionHeads

if __name__ == "__main__":
    render_scene(AttentionHeads, "heads", 34)
