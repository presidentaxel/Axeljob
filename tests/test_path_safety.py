"""Tests for backend.path_safety."""

from pathlib import Path

import pytest

from backend.path_safety import (
    adaptation_json_path,
    is_safe_id_segment,
    resolve_export_output_base,
    resolve_relative_under,
    resolve_under_base,
    safe_basename,
    write_bytes_in_dir,
)


def test_is_safe_id_segment():
    assert is_safe_id_segment("abc_123-456")
    assert not is_safe_id_segment("../etc")
    assert not is_safe_id_segment("")


def test_resolve_under_base_blocks_traversal(tmp_path: Path):
    base = tmp_path / "data"
    base.mkdir()
    child = resolve_under_base(base, "ok", "file.txt")
    assert child.is_relative_to(base.resolve())
    with pytest.raises(ValueError):
        resolve_under_base(base, "..", "passwd")


def test_adaptation_json_path(tmp_path: Path):
    p = adaptation_json_path(tmp_path, "user_offer_abc")
    assert p.name == "user_offer_abc.json"
    with pytest.raises(ValueError):
        adaptation_json_path(tmp_path, "../../x")


def test_resolve_relative_under(tmp_path: Path):
    sub = tmp_path / "assets"
    sub.mkdir()
    f = sub / "photo.jpg"
    f.write_text("x", encoding="utf-8")
    got = resolve_relative_under(tmp_path, "assets/photo.jpg")
    assert got == f.resolve()
    assert resolve_relative_under(tmp_path, "../../etc/passwd") is None


def test_safe_basename():
    assert safe_basename("../../evil.pdf") == "evil.pdf"
    assert safe_basename("") == "file"


def test_write_bytes_in_dir(tmp_path: Path):
    dest = write_bytes_in_dir(tmp_path, "../../x.pdf", b"pdf", default_name="out.pdf")
    assert dest.parent == tmp_path.resolve()
    assert dest.read_bytes() == b"pdf"


def test_resolve_export_output_base_rejects_traversal(tmp_path: Path):
    default = tmp_path / "exports"
    default.mkdir()
    got = resolve_export_output_base(str(default / ".." / "etc"), default=default)
    assert got == default.resolve()
