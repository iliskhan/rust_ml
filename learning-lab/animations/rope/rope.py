"""Silent visual lesson; all values come from the matching TypeScript fixture."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from legacy_visuals import VisualLesson

class RopeRotation(VisualLesson):
    slug = 'rope'
