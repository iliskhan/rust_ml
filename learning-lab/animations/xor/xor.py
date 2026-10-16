"""Silent visual lesson; values come from the TypeScript fixture."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from legacy_visuals import VisualLesson

class XORNetwork(VisualLesson):
    slug = 'xor'
