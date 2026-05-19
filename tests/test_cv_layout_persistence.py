"""
Tests de persistance du champ `layout` du CV (P2.3).

`save_cv_base` / `load_cv_base` doivent :
  1. Sauvegarder et relire un `layout` non vide a l identique.
  2. Preserver le `layout` existant si un nouveau payload ne contient
     pas la cle (compatibilite avec les vieux clients / route PATCH
     legacy).
  3. Ecraser le `layout` si le payload envoie explicitement une
     nouvelle valeur (y compris `None` pour revenir au defaut).

On utilise le fallback fichier (`CV_BASE_PATH`, row_id="default")
pour eviter de monter un Supabase. Le code de save partage la meme
branche de logique pour Supabase et le fichier.
"""

from __future__ import annotations

import json
import os

import pytest

from backend import db


@pytest.fixture
def cv_base_tmpfile(tmp_path, monkeypatch):
    """Redirige `CV_BASE_PATH` vers un fichier temporaire et force le
    mode fichier (pas de Supabase)."""
    tmp = tmp_path / "cv_base.json"
    monkeypatch.setattr(db, "CV_BASE_PATH", tmp)
    monkeypatch.setattr(db, "_get_supabase", lambda: None)
    yield tmp
    if tmp.exists():
        os.remove(tmp)


def _read(tmp):
    if not tmp.exists():
        return None
    return json.loads(tmp.read_text(encoding="utf-8"))


def test_save_then_load_preserves_layout(cv_base_tmpfile):
    layout = {
        "version": 1,
        "sectionsOrder": [
            "resume",
            "experiences",
            "formations",
            "competences",
            "certifications",
            "projets",
        ],
        "sidebarRatio": 35,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "nom": "B", "layout": layout})
    loaded = db.load_cv_base()
    assert loaded["layout"] == layout


def test_partial_save_preserves_existing_layout(cv_base_tmpfile):
    layout = {
        "version": 1,
        "sectionsOrder": ["experiences", "formations"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    # Payload "legacy" qui ne connait pas `layout`.
    db.save_cv_base({"prenom": "A", "nom": "Updated"})
    loaded = db.load_cv_base()
    assert loaded["layout"] == layout
    assert loaded["nom"] == "Updated"


def test_explicit_null_layout_clears_persisted_value(cv_base_tmpfile):
    layout = {
        "version": 1,
        "sectionsOrder": ["experiences"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    # L user revient au layout par defaut -> le client envoie `null`.
    db.save_cv_base({"prenom": "A", "layout": None})
    loaded = db.load_cv_base()
    assert loaded.get("layout") is None


def test_layout_not_set_then_save_with_layout(cv_base_tmpfile):
    db.save_cv_base({"prenom": "A"})
    assert _read(cv_base_tmpfile).get("layout") is None
    layout = {
        "version": 1,
        "sectionsOrder": ["resume", "experiences"],
        "sidebarRatio": 30,
        "theme": "default",
    }
    db.save_cv_base({"prenom": "A", "layout": layout})
    assert db.load_cv_base()["layout"] == layout


def test_preservation_keeps_template_id_and_options(cv_base_tmpfile):
    """Le test garantit que la prise en charge de `layout` n a pas casse
    la preservation existante de template_id / template_options."""
    db.save_cv_base(
        {
            "prenom": "A",
            "template_id": "executive",
            "template_options": {"primary_color": "#123456"},
        }
    )
    db.save_cv_base({"prenom": "A", "nom": "B"})
    loaded = db.load_cv_base()
    assert loaded["template_id"] == "executive"
    assert loaded["template_options"] == {"primary_color": "#123456"}
