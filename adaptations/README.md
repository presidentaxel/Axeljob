# Adaptations (tweaks par annonce)

Ce dossier contient les **tweaks** générés par Gemini pour chaque adaptation : résumé réécrit, bullet points modifiés par expérience, et mots-clés cachés ATS.

- **cv_base.json n’est jamais modifié** : il reste la source de vérité.
- Chaque fichier `YYYYMMDDHHMM_<hash>.json` correspond à une adaptation (annonce collée à un instant T).
- Contenu typique : `resume`, `experiences` (id + bullet_points), `mots_cles_cache`, `rapport`, `description_preview`.

Ces fichiers servent d’historique / base de données légère ; le frontend et le PDF utilisent toujours **cv_base + tweaks** en mémoire.
