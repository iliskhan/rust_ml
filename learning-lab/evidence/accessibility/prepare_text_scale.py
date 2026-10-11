"""Copy a production build and prepare a 200% CSS text stress test.

This is not native browser text-only zoom. JS, SVG font-size attributes,
inline styles, custom properties and relative font declarations stay intact.
"""

import argparse
from decimal import Decimal
import json
from pathlib import Path
import re
import shutil


WORKTREE = Path(__file__).resolve().parents[3]
NUMBER = r"[+-]?(?:\d*\.\d+|\d+(?:\.\d*)?)"
ABSOLUTE_SIZE = re.compile(rf"({NUMBER})(px|pt|vw)\b", re.IGNORECASE)
FONT_SIZE = re.compile(
    rf"(?:calc|clamp|min|max)\(|{NUMBER}(?:rem|em|px|pt|vw|vh|vmin|vmax|ch|ex|%)",
    re.IGNORECASE,
)
DECLARATION = re.compile(
    r"/\*.*?\*/|(?<=[{;])\s*(?P<property>font-size|font)\s*:\s*(?P<value>[^;}]+)",
    re.IGNORECASE | re.DOTALL,
)


def scale_css(css, counts):
    def double(match):
        counts["absolute_sizes_doubled"] += 1
        value = format(Decimal(match[1]) * 2, "f")
        if "." in value:
            value = value.rstrip("0").rstrip(".")
        return value + match[2]

    def declaration(match):
        if match["property"] is None:  # Preserve CSS comments.
            return match[0]
        value = match["value"]
        start, end = 0, len(value)
        if match["property"].lower() == "font":
            size = FONT_SIZE.search(value)
            if size is None:
                return match[0]  # inherit, system fonts, etc.
            start, end = size.span()
            if size[0].endswith("("):
                depth = 1
                while end < len(value) and depth:
                    depth += (value[end] == "(") - (value[end] == ")")
                    end += 1
                if depth:
                    raise ValueError("Unbalanced font-size function in CSS")
        before = counts["absolute_sizes_doubled"]
        changed = ABSOLUTE_SIZE.sub(double, value[start:end])
        if counts["absolute_sizes_doubled"] != before:
            counts["declarations_changed"] += 1
        offset = match.start("value") - match.start()
        return match[0][:offset] + value[:start] + changed + value[end:]

    return DECLARATION.sub(declaration, css) + "\nhtml{font-size:200%!important}\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    source = args.dist.resolve(strict=True)
    output = args.output.resolve()
    if not source.is_dir() or not (source / "index.html").is_file():
        parser.error("dist must be a production build containing index.html")
    if not output.is_relative_to(WORKTREE):
        parser.error("output must be inside this worktree")
    if output.exists() or output.is_relative_to(source):
        parser.error("output must be a new directory outside dist; nothing is overwritten")

    counts = {"css_files": 0, "declarations_changed": 0, "absolute_sizes_doubled": 0}
    prepared = {}
    for path in sorted(source.rglob("*.css")):
        counts["css_files"] += 1
        prepared[path.relative_to(source)] = scale_css(path.read_text(encoding="utf-8"), counts)
    if not counts["css_files"] or not counts["absolute_sizes_doubled"]:
        parser.error("No absolute CSS font sizes found; inspect the source before claiming scaling")

    shutil.copytree(source, output)
    for relative, css in prepared.items():
        (output / relative).write_text(css, encoding="utf-8")
    print(json.dumps({
        "mode": "200% CSS text stress test, not native browser zoom",
        "source": str(source), "output": str(output), **counts,
        "root_font_size": "200%", "js_and_svg_attributes_modified": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
