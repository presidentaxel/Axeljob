"""Export texte brut d'un CV sémantique (AXE-330)."""

from __future__ import annotations

from typing import Any


def _as_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _join_nonempty(parts: list[str], sep: str = " · ") -> str:
    return sep.join(p for p in parts if p)


def _list_skills(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
            continue
        if isinstance(item, dict):
            s = _as_str(
                item.get("name") or item.get("label") or item.get("value") or item.get("text")
            )
            if s:
                out.append(s)
    return out


def _section(title: str, lines: list[str]) -> list[str]:
    body = [line for line in lines if line]
    if not body:
        return []
    return ["", title.upper(), "-" * len(title), *body]


def cv_to_plain_text(cv: dict | None) -> str:
    """
    Sérialise le JSON sémantique `cv` en texte lisible (ATS / collage).
    Ne tente pas de reproduire le layout canvas.
    """
    data = cv if isinstance(cv, dict) else {}
    lines: list[str] = []

    identity = _join_nonempty(
        [
            _as_str(data.get("prenom")),
            _as_str(data.get("nom")),
        ],
        sep=" ",
    )
    if identity:
        lines.append(identity)
    titre = _as_str(data.get("titre_professionnel"))
    if titre:
        lines.append(titre)

    contact = _join_nonempty(
        [
            _as_str(data.get("email")),
            _as_str(data.get("telephone")),
            _as_str(data.get("linkedin")),
            _as_str(data.get("ville") or data.get("localisation")),
        ]
    )
    if contact:
        lines.append(contact)

    resume = _as_str(data.get("resume"))
    lines.extend(_section("Profil", [resume] if resume else []))

    exp_lines: list[str] = []
    for row in data.get("experiences") or []:
        if not isinstance(row, dict):
            continue
        head = _join_nonempty(
            [
                _as_str(row.get("poste")),
                _as_str(row.get("entreprise")),
            ]
        )
        dates = _join_nonempty(
            [_as_str(row.get("date_debut")), _as_str(row.get("date_fin"))],
            sep=" – ",
        )
        lieu = _as_str(row.get("lieu"))
        desc = _as_str(row.get("description") or row.get("missions"))
        block = [x for x in (head, dates, lieu, desc) if x]
        if block:
            exp_lines.extend(block)
            exp_lines.append("")
    if exp_lines and not exp_lines[-1]:
        exp_lines.pop()
    lines.extend(_section("Expériences", exp_lines))

    form_lines: list[str] = []
    for row in data.get("formations") or []:
        if not isinstance(row, dict):
            continue
        head = _join_nonempty([_as_str(row.get("diplome")), _as_str(row.get("etablissement"))])
        date = _as_str(row.get("date"))
        block = [x for x in (head, date) if x]
        if block:
            form_lines.extend(block)
            form_lines.append("")
    if form_lines and not form_lines[-1]:
        form_lines.pop()
    lines.extend(_section("Formations", form_lines))

    competences = data.get("competences") if isinstance(data.get("competences"), dict) else {}
    tech = _list_skills(competences.get("techniques"))
    soft = _list_skills(competences.get("logiciels") or competences.get("outils"))
    autres = _list_skills(competences.get("autres"))
    skill_lines: list[str] = []
    if tech:
        skill_lines.append("Techniques : " + ", ".join(tech))
    if soft:
        skill_lines.append("Outils : " + ", ".join(soft))
    if autres:
        skill_lines.append("Autres : " + ", ".join(autres))
    lines.extend(_section("Compétences", skill_lines))

    lang_lines: list[str] = []
    for row in competences.get("langues") or []:
        if isinstance(row, str):
            s = row.strip()
            if s:
                lang_lines.append(s)
            continue
        if isinstance(row, dict):
            s = _join_nonempty([_as_str(row.get("langue")), _as_str(row.get("niveau"))])
            if s:
                lang_lines.append(s)
    lines.extend(_section("Langues", lang_lines))

    cert_lines: list[str] = []
    for row in data.get("certifications") or []:
        if not isinstance(row, dict):
            continue
        s = _join_nonempty(
            [
                _as_str(row.get("nom")),
                _as_str(row.get("organisme")),
                _as_str(row.get("date")),
            ]
        )
        if s:
            cert_lines.append(s)
    lines.extend(_section("Certifications", cert_lines))

    projet_lines: list[str] = []
    for row in data.get("projets") or []:
        if not isinstance(row, dict):
            continue
        head = _as_str(row.get("nom"))
        desc = _as_str(row.get("description"))
        block = [x for x in (head, desc) if x]
        if block:
            projet_lines.extend(block)
            projet_lines.append("")
    if projet_lines and not projet_lines[-1]:
        projet_lines.pop()
    lines.extend(_section("Projets", projet_lines))

    text = "\n".join(lines).strip()
    return text + ("\n" if text else "")
