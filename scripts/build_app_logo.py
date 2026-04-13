"""Build public/app-logo.svg as mark-only (no Illustrator wordmark paths)."""
import re
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "public" / "favicon-full.svg"
out = root / "public" / "app-logo.svg"
mirror = root / "public" / "owe-it-logo.svg"

s = src.read_text(encoding="utf-8")
m = re.search(r'(</defs>)(.*?)(<g clip-path="url\(#75c9a9569e\)">)', s, re.DOTALL)
if not m:
    raise SystemExit("Could not find icon start marker in favicon-full.svg")
clean = s[: m.start()] + m.group(1) + m.group(3) + s[m.end() :]
clean = re.sub(
    r"<svg[^>]+>",
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
    'viewBox="874 242 250 250" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision">',
    clean,
    count=1,
)
out.write_text(clean, encoding="utf-8", newline="")
shutil.copyfile(out, mirror)
print(f"Wrote {out.relative_to(root)} ({len(clean)} bytes)")
print(f"Mirrored to {mirror.relative_to(root)}")
