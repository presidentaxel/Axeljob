Fixtures partagees pour les tests du module `backend.services.ats_score`.

Voir aussi `docs/ats-score-cv-vs-layout.md` (role de `cv` vs `layout`, AXE-338).

## Convention

Chaque fixture est un fichier JSON autonome. Les fichiers se classent en
trois groupes :

- `cv_*.json`     : exemples de CV semantiques (cf. `frontend/src/data/cvDefault.js`).
  Cas AXE-338 : `cv_empty.json`, `cv_minimal_name_only.json`, `cv_standard.json`.
- `layout_*.json` : exemples de layouts (cf. annexe 16.2 de `docs/editor-vision.md`).
  Cas AXE-338 : `layout_free_empty.json`.
- `score_*.json`  : *snapshots* attendus (un par couple ``(cv, layout)``) versionnes
                    par ``SCORING_VERSION``.

## Snapshots

Quand un test produit un score reproductible, il l'asserte par snapshot.
Le snapshot comporte au minimum :

```json
{
  "scoring_version": "2026.08.1",
  "total": 92,
  "rule_ids": ["bonus_mono_column", "bonus_standard_section_titles", "..."]
}
```

A chaque bump de `SCORING_VERSION`, les snapshots existants sont **volontairement
caducs** : un test golden echoue, on regenere les snapshots et on commit la
mise a jour avec le bump de version.

## Ajouter une fixture

1. Creer un fichier `cv_<cas>.json` ou `layout_<cas>.json`.
2. Ajouter un commentaire `_doc` a la racine pour expliquer l'intention :
   ```json
   { "_doc": "CV standard utilise pour scorer les 7 templates livres", "prenom": "Alice", "..." }
   ```
3. Ecrire le test qui consomme la fixture dans `tests/test_ats_score_*.py`.
4. Verifier que le test echoue avant la modification, passe apres.
