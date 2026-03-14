"""
Contrôles de sécurité : détection de tentatives d'injection dans les champs envoyés à l'IA.
Rejeter en 400 avec un message générique (sans révéler la raison).
"""
import re
from typing import Optional

# Expressions suspectes (injection de prompt) — en minuscules, recherche insensible à la casse
_PROMPT_INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all instructions",
    "ignore the above",
    "disregard previous",
    "disregard the above",
    "disregard all",
    "new instructions:",
    "following instructions:",
    "output the following instead",
    "respond with the following",
    "print the following",
    "return the following json",
    "tu dois maintenant",
    "you must now",
    "override instructions",
    "forget everything",
    "ignore everything above",
    "new prompt:",
    "system:",
    "assistant:",
    "### instruction",
    "### new instruction",
]


def looks_like_prompt_injection(text: Optional[str], max_scan_length: int = 8000) -> bool:
    """
    Détecte si le texte contient des tournures typiques d'injection de prompt.
    Ne scanne que les max_scan_length premiers caractères pour limiter le coût.
    """
    if not text or not isinstance(text, str):
        return False
    sample = text[:max_scan_length].lower()
    for pattern in _PROMPT_INJECTION_PATTERNS:
        if pattern in sample:
            return True
    # Variantes avec retours à la ligne ou espaces
    if re.search(r"ignore\s+(all\s+)?(previous|above|prior)\s+instructions", sample):
        return True
    if re.search(r"disregard\s+(all\s+)?(previous|above)", sample):
        return True
    return False


def check_user_input_for_injection(
    description: Optional[str] = None,
    instruction: Optional[str] = None,
    text: Optional[str] = None,
) -> None:
    """
    Vérifie les champs utilisateur avant envoi à Gemini.
    Lève ValueError si un champ semble contenir une tentative d'injection (message générique).
    """
    if description and looks_like_prompt_injection(description):
        raise ValueError("Contenu non autorisé dans ce champ.")
    if instruction and looks_like_prompt_injection(instruction, max_scan_length=2500):
        raise ValueError("Contenu non autorisé dans ce champ.")
    if text and looks_like_prompt_injection(text):
        raise ValueError("Contenu non autorisé dans ce champ.")
