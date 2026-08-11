"""Safe path resolution (traversal / path-injection guards for CodeQL and runtime)."""

from __future__ import annotations

import os
import re
from pathlib import Path

_FILENAME_UNSAFE = re.compile(r'[<>:"/\\|?\x00]')
# Un seul segment de chemin (pas de séparateur) ; caractères autorisés pour noms export / PDF.
_SAFE_SEGMENT_RE = re.compile(r"^[^\x00/\\<>|?*]+$")


def is_safe_id_segment(value: str, *, max_len: int = 80) -> bool:
    if not value or len(value) > max_len:
        return False
    return all(c.isalnum() or c in "_-" for c in value)


def _is_safe_path_segment(part: str) -> bool:
    if not part or part in (".", ".."):
        return False
    if "/" in part or "\\" in part:
        return False
    if part != os.path.basename(part):
        return False
    return bool(_SAFE_SEGMENT_RE.fullmatch(part))


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
    """Resolve ``base / part1 / ...`` and ensure the result stays under ``base`` (``commonpath``)."""
    base_abs = os.path.abspath(str(base))
    if not parts:
        return Path(base_abs)
    for part in parts:
        if not _is_safe_path_segment(part):
            raise ValueError("path traversal")
    joined = os.path.abspath(os.path.join(base_abs, *parts))
    try:
        common = os.path.commonpath([base_abs, joined])
    except ValueError as exc:
        raise ValueError("path outside base") from exc
    if common != base_abs:
        raise ValueError("path outside base")
    return Path(joined)


def write_bytes_in_dir(
    directory: Path,
    filename: str,
    data: bytes,
    *,
    default_name: str = "file",
) -> Path:
    """Write ``data`` to a single file under ``directory`` (basename only)."""
    name = safe_basename(filename, default=default_name)
    target = resolve_under_base(directory, name)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def resolve_export_output_base(output_base: str | None, *, default: Path) -> Path:
    """Resolve export directory under ``default`` only (no arbitrary user paths).

    Accepts:
    - empty / None → ``default``
    - exact string equal to ``default`` (client round-trip of ``/api/export-default-dir``)
    - relative segments under ``default`` (validated via ``resolve_under_base``)

    Rejects traversal, ``~``, and absolute paths other than ``default``.
    """
    default_abs = os.path.abspath(str(default))
    default_path = Path(default_abs)
    if not output_base or not str(output_base).strip():
        return default_path
    raw = str(output_base).strip().replace("\\", "/")
    if not raw or ".." in raw or raw.startswith("~"):
        return default_path
    # Round-trip of the known default path (no Path(user).resolve() — CodeQL).
    if raw.rstrip("/") == default_abs.rstrip("/\\").replace("\\", "/") or raw.rstrip("/") == str(
        default
    ).rstrip("/\\").replace("\\", "/"):
        return default_path
    if os.path.isabs(raw) or (len(raw) > 1 and raw[1] == ":"):
        return default_path
    parts = [p for p in raw.split("/") if p and p != "."]
    if not parts:
        return default_path
    try:
        return resolve_under_base(default_path, *parts)
    except ValueError:
        return default_path


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
