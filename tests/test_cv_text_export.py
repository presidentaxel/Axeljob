"""Tests export texte CV (AXE-330)."""

from backend.services.cv_text_export import cv_to_plain_text


def test_cv_to_plain_text_includes_identity_and_sections():
    text = cv_to_plain_text(
        {
            "prenom": "Ada",
            "nom": "Lovelace",
            "titre_professionnel": "Analyste",
            "email": "ada@example.com",
            "resume": "Pionnière du calcul.",
            "experiences": [
                {
                    "poste": "Analyste",
                    "entreprise": "Babbage",
                    "date_debut": "1840",
                    "date_fin": "1850",
                }
            ],
            "competences": {"techniques": ["Maths", "Algo"]},
        }
    )
    assert "Ada Lovelace" in text
    assert "Analyste" in text
    assert "ada@example.com" in text
    assert "PROFIL" in text
    assert "EXPÉRIENCES" in text or "EXPERIENCES" in text.upper()
    assert "Maths" in text


def test_cv_to_plain_text_empty_cv():
    assert cv_to_plain_text({}) == ""
    assert cv_to_plain_text(None) == ""
