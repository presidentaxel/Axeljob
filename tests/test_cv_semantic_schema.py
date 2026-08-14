"""Tests AXE-332 — dual-key + semantic_meta."""

from backend.services.cv_semantic_schema import (
    build_semantic_meta,
    estimate_field_confidence,
    sync_dual_keys,
)


def test_sync_dual_keys_fr_fills_en():
    out = sync_dual_keys({"prenom": "Ada", "nom": "Lovelace"})
    assert out["first_name"] == "Ada"
    assert out["last_name"] == "Lovelace"


def test_sync_dual_keys_en_fills_fr():
    out = sync_dual_keys({"first_name": "Grace", "last_name": "Hopper"})
    assert out["prenom"] == "Grace"
    assert out["nom"] == "Hopper"


def test_sync_dual_keys_fr_wins_on_conflict():
    out = sync_dual_keys({"prenom": "Ada", "first_name": "Other", "nom": "Lovelace", "last_name": "X"})
    assert out["prenom"] == "Ada"
    assert out["first_name"] == "Ada"
    assert out["nom"] == "Lovelace"
    assert out["last_name"] == "Lovelace"


def test_build_semantic_meta_marks_missing_critical():
    meta = build_semantic_meta({"prenom": "Ada"}, source="test")
    assert meta["dual_key"] is True
    assert meta["schema_version"] == 1
    assert "email" in meta["missing_critical_fields"]
    assert meta["fields"]["prenom"] >= 0.9
    assert meta["fields"]["first_name"] >= 0.9


def test_estimate_field_confidence_sections():
    cv = sync_dual_keys(
        {
            "prenom": "A",
            "nom": "B",
            "experiences": [{"id": "exp_1", "poste": "Dev", "entreprise": "X"}],
        }
    )
    conf = estimate_field_confidence(cv)
    assert conf["experiences"] >= 0.8
    assert conf["formations"] == 0.0
