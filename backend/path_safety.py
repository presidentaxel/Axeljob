"""Safe path resolution (traversal / path-injection guards for CodeQL and runtime)."""

from __future__ import annotations

import re
from pathlib import Path

_FILENAME_UNSAFE = re.compile(r'[<>:"/\\|?\x00]')


def is_safe_id_segment(value: str, *, max_len: int = 80) -> bool:
    if not value or len(value) > max_len:
        return False
    return all(c.isalnum() or c in "_-" for c in value)


def safe_basename(name: str, *, max_len: int = 120, default: str = "file") -> str:
    """Return a single path segment safe for joining under a known base directory."""
    base = Path((name or "").strip()).name
    if not base or base in (".", ".."):
        return default
    base = _FILENAME_UNSAFE.sub("", base)
    base = re.sub(r"\s+", " ", base).strip()
    if not base:
        return default
    return base[:max_len]


def resolve_under_base(base: Path, *parts: str) -> Path:
    """Resolve ``base / part1 / part2 / ...`` and ensure the result stays under ``base``."""
    base_r = base.resolve()
    if not parts:
        return base_r
    rel = Path(*parts)
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError("path traversal")
    out = (base_r / rel).resolve()
    if not out.is_relative_to(base_r):
        raise ValueError("path outside base")
    return out


def adaptation_json_path(adaptations_dir: Path, adaptation_id: str) -> Path:
    if not is_safe_id_segment(adaptation_id):
        raise ValueError("invalid adaptation_id")
    return resolve_under_base(adaptations_dir.resolve(), f"{adaptation_id}.json")


def resolve_relative_under(base: Path, relative: str) -> Path | None:
    """Map a stored relative URL/path to a file under ``base``, or None if unsafe."""
    rel = (relative or "").strip().replace("\\", "/").lstrip("/")
    if not rel or rel.startswith("..") or "/../" in f"/{rel}/":
        return None
    parts = [p for p in rel.split("/") if p and p != "."]
    if not parts or ".." in parts:
        return None
    try:
        return resolve_under_base(base.resolve(), *parts)
    except ValueError:
        return None
