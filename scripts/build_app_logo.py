"""Sync public/app-logo.svg to favicon and owe-it-logo mirrors."""
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src = root / "public" / "app-logo.svg"
if not src.is_file():
    raise SystemExit(f"Missing {src.relative_to(root)}")

for name in ("owe-it-logo.svg", "favicon.svg"):
    dest = root / "public" / name
    shutil.copyfile(src, dest)
    print(f"Mirrored to {dest.relative_to(root)}")

print(f"Source: {src.relative_to(root)} ({src.stat().st_size} bytes)")
