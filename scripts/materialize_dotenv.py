#!/usr/bin/env python3
"""Write `.env` and `frontend/.env` from process env (Cursor Cloud secrets).

Never prints secret values. Existing files are merged: injected env vars win,
then already-set file values, then safe local-dev defaults.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from collections.abc import Mapping
from pathlib import Path

ASSIGN_RE = re.compile(r"^(\s*#\s*)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")

DEV_DEFAULTS = {
    "ENVIRONMENT": "development",
    "VITE_API_URL": "http://localhost:8000",
    "CV_BOT_API_BASE_URL": "http://localhost:8000",
    "CV_BOT_FRONTEND_URL": "http://localhost:5173",
}

# Public Vite URL is the same project URL as the backend secret.
ALIASES = {
    "VITE_SUPABASE_URL": "SUPABASE_URL",
}

TARGETS = (
    (".env.example", ".env"),
    (os.path.join("frontend", ".env.example"), os.path.join("frontend", ".env")),
)


def _clean(value: str) -> str:
    return value.replace("\r", "").replace("\n", "").strip()


def parse_assignments(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match:
            continue
        _prefix, key, value = match.groups()
        if key not in found:
            found[key] = _clean(value)
    return found


def resolve_value(
    key: str,
    *,
    example_value: str,
    was_commented: bool,
    existing: Mapping[str, str],
    environ: Mapping[str, str],
) -> str | None:
    """Return the value to write, or None to keep the original example line."""
    env_val = _clean(environ.get(key, ""))
    if env_val:
        return env_val

    existing_val = _clean(existing.get(key, ""))
    if existing_val:
        return existing_val

    alias = ALIASES.get(key)
    if alias:
        alias_val = _clean(environ.get(alias, "")) or _clean(existing.get(alias, ""))
        if alias_val:
            return alias_val

    default = DEV_DEFAULTS.get(key)
    if default and (was_commented or not _clean(example_value)):
        return default

    if was_commented:
        return None
    return example_value


def fill_template(example: str, existing_text: str | None, environ: Mapping[str, str]) -> str:
    existing = parse_assignments(existing_text or "")
    lines_out: list[str] = []
    for raw in example.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match:
            lines_out.append(raw)
            continue
        prefix, key, example_value = match.groups()
        was_commented = bool(prefix)
        value = resolve_value(
            key,
            example_value=example_value,
            was_commented=was_commented,
            existing=existing,
            environ=environ,
        )
        if value is None:
            lines_out.append(raw)
            continue
        lines_out.append(f"{key}={value}")
    return "\n".join(lines_out) + "\n"


def summarize(text: str) -> tuple[int, int]:
    filled = 0
    empty = 0
    for raw in text.splitlines():
        match = ASSIGN_RE.match(raw)
        if not match or match.group(1):
            continue
        if _clean(match.group(3)):
            filled += 1
        else:
            empty += 1
    return filled, empty


def materialize(root: Path, environ: Mapping[str, str]) -> list[Path]:
    written: list[Path] = []
    for example_rel, dest_rel in TARGETS:
        example_path = root / example_rel
        dest_path = root / dest_rel
        if not example_path.is_file():
            raise FileNotFoundError(f"Template manquant: {example_path}")
        example = example_path.read_text(encoding="utf-8")
        existing = dest_path.read_text(encoding="utf-8") if dest_path.is_file() else None
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_text(fill_template(example, existing, environ), encoding="utf-8")
        written.append(dest_path)
        filled, empty = summarize(dest_path.read_text(encoding="utf-8"))
        print(f"Wrote {dest_rel} ({filled} keys set, {empty} still empty)")
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".",
        help="Repository root (default: current directory)",
    )
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        materialize(root, os.environ)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
