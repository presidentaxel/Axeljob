"""
Réduction du risque d’injection HTML via du CSS utilisateur inséré dans <style>...</style>.

On supprime les séquences qui ferment prématurément la balise <style> ou ouvrent </script>.
Ce n’est pas un parseur CSS complet ; il complète l’usage de Jinja sandbox côté templates perso.
"""

from __future__ import annotations

import re

# Fermeture </style> depuis l’intérieur d’un bloc style (navigateur / moteurs HTML).
_STYLE_CLOSE = re.compile(r"<\s*/\s*style\b", re.IGNORECASE)
_SCRIPT_OPEN = re.compile(r"<\s*script\b", re.IGNORECASE)
_SCRIPT_CLOSE = re.compile(r"<\s*/\s*script\b", re.IGNORECASE)


def sanitize_css_for_style_tag(css: str | None) -> str:
    if not css or not isinstance(css, str):
        return ""
    s = css.replace("\x00", "\ufffd")
    s = _STYLE_CLOSE.sub("", s)
    s = _SCRIPT_OPEN.sub("", s)
    s = _SCRIPT_CLOSE.sub("", s)
    return s
