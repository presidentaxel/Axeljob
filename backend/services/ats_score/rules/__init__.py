"""Agregation des regles ATS publiques.

Importer une nouvelle regle ici (et l'ajouter a ``parsing_rules``) suffit
pour qu'elle soit prise en compte par :func:`backend.services.ats_score.score_parsing`.

Cette indirection garantit qu'aucun autre fichier (engine, API, tests) n'a
besoin de connaitre la liste exhaustive des regles. Voir :
``docs/editor-vision.md`` section 9.2 pour la documentation fonctionnelle des
regles, et section 12.4 pour les anti-patterns interdits.
"""

from __future__ import annotations

from backend.services.ats_score.rules import content, free_canvas, layout, meta, typography

# Ordre stable, repris tel quel dans l'UI pour expliquer le score.
# Convention : penalites lourdes d'abord, puis penalites moyennes,
# puis penalites legeres, puis bonus.
parsing_rules: tuple = (
    # --- Penalites lourdes / dealbreakers
    # (les regles "PDF rasterise", "police non embarquee", etc. vivent dans
    # ``ats_parsing_check`` car elles necessitent l'octet PDF reel ; elles
    # ajusteront le score via ``adjust_score_with_ground_truth``).
    layout.rule_table_layout,
    # --- Penalites moyennes (design risque)
    layout.rule_multi_column,
    layout.rule_sidebar_present,
    layout.rule_free_canvas_text_positions,
    free_canvas.rule_free_canvas_missing_profile_sections,
    free_canvas.rule_free_canvas_reading_order,
    free_canvas.rule_identity_not_first_in_reading,
    free_canvas.rule_experiences_before_resume,
    free_canvas.rule_contact_far_from_top,
    typography.rule_exotic_font,
    typography.rule_body_font_size_out_of_range,
    # --- Penalites legeres
    meta.rule_photo_present,
    content.rule_inconsistent_dates,
    # --- Bonus
    typography.rule_mono_column_bonus,
    content.rule_standard_section_titles,
    content.rule_contact_top_of_page,
    content.rule_dates_format_consistent,
)


__all__ = ["parsing_rules"]
