# AXE-41 — Spike pipeline import PDF/Word → CV éditable + scoré

> Spike Linear : [AXE-41](https://linear.app/axel-project/issue/AXE-41) · Issue GH : [#78](https://github.com/presidentaxel/Axeljob/issues/78)  
> Date : 2026-08-13 · Branche : `louisvedovato/axe-41-spike-pipeline-import-pdfword-cv-editable-score-3-sorties-au`  
> Audit : `docs/canva-editor-audit.md` § P4

---

## Verdict

**Faisable sans nouvelles libs.** Le pipeline d’extraction (texte + structure PDF + parse IA) existe déjà sur `main`. Ce qui manque pour P4 produit, ce n’est pas l’extracteur : c’est le **choix utilisateur entre 3 sorties scorées**, la **durcification Word**, et la **politique scanned/OCR**.

Promesse produit à tenir : *reconstruction propre, éditable, scorée* — **pas** pixel-perfect.

---

## Stack retenue (pas de swap)

| Besoin | Lib déjà pinnée | Rôle |
|--------|-----------------|------|
| Texte PDF | `pdfplumber==0.11.10` | Lecture type ATS / sections |
| Layout PDF natif | `pymupdf==1.28.2` (+ `fonttools`) | Reconstruction free-canvas mm |
| Word | `python-docx==1.2.0` | Paragraphes `.docx` uniquement |
| Sections sémantiques | Gemini (existant) | `cv` + `layout_hints` |
| Fallback design | `cv_import_layout_vision` | Quand structurel échoue |

**Ne pas introduire** OCR / Apache Tika / mammoth dans le MVP.  
**Hors MVP :** fichiers `.doc` legacy (convertir côté client ou refuser clairement).

---

## État du code (déjà livré)

| Étape audit P4 | État |
|----------------|------|
| 1. Upload PDF/Word | `POST /api/cv/import` |
| 2. Extraction texte + structure | pdfplumber / docx + `extract_layout_from_pdf` |
| 3. Détection sections | Gemini (+ heuristique offline spike) |
| 4. Layout approximatif | Structurel → vision → preset (`buildFullCanvasImportLayout`) |
| 5. **3 sorties au choix** | **Absent** (auto-path unique) |
| 6. Score ATS comparé | Pièces dispo (`ats_score`, `verify-pdf`) — **non branchées à l’import** |
| 7. Choix → canvas | Auto-apply dans Beta |

Mapping des 3 sorties futures → briques existantes :

| Sortie | Construction proposée |
|--------|------------------------|
| **(a) ATS-safe** | `cv` sémantique + preset `minimal` / tags `ats-safe` |
| **(b) Design proche** | Layout structurel PDF (ou vision+preset) |
| **(c) Mix** | (b) puis `applyAtsLayoutOptimizations` |

---

## Démo spike (3+1 samples)

Fixtures anonymisées : `tests/fixtures/import_samples/`

| Fichier | Intention | Résultat offline (2026-08-13) |
|---------|-----------|-------------------------------|
| `01_single_column.pdf` | Mono-colonne lisible | Texte OK · sections Profil/XP/… · structurel **oui** |
| `02_sidebar.pdf` | Sidebar colorée | Texte OK · structurel **oui** (formes + texte) |
| `03_dense_multisection.pdf` | Dense multi-sections | Texte OK · 7 headings · structurel **oui** |
| `04_single_column.docx` | Parité Word | Texte + sections OK · structurel **non** (attendu) |

Commandes :

```bash
PYTHONPATH=. python backend/scripts/generate_import_samples.py
PYTHONPATH=. python backend/scripts/demo_import_extract.py
PYTHONPATH=. pytest tests/test_import_samples_extract.py tests/test_cv_import_probe.py -q
```

Module : `backend/services/cv_import_probe.py` (offline, sans Gemini).

---

## Fiabilité reconstruction layout

| Cas | Fiabilité estimée | Notes |
|-----|-------------------|-------|
| PDF natif mono-colonne | **Haute** | Structurel + texte cohérents |
| PDF natif sidebar / formes | **Moyenne–haute** | Blocs déplaçables ; sémantique sections encore IA |
| PDF dense multi-sections | **Moyenne** | Ordre lecture OK ; édition fine = freeform text |
| PDF scanné / image | **Basse** | Structurel → `None` ; vision seule ; OCR hors MVP |
| DOCX | **Contenu haute / layout nulle** | Pas de positions mm ; sortir (a) ou preset |
| `.doc` binaire | **Nulle** | Refuser ou convertir avant upload |

Risque produit principal : l’utilisateur attend un clone Canva du PDF ; il faut un **copy UX** explicite (« 3 propositions scorées, pas un fac-similé »).

---

## Risques

1. **Attente pixel-perfect** → messaging + preview scorée.
2. **Freeform structurel peu éditable** (texte non lié aux sections CV) → ticket « semantic binding ».
3. **Gemini flaky / coût** → garder heuristiques offline + cache.
4. **PII dans fixtures** → samples fictifs uniquement (déjà le cas).
5. **Word tables / text boxes** → python-docx partiel ; MVP = paragraphes.

---

## Périmètre MVP recommandé (après spike)

**In**

1. Générer les 3 variantes layout à partir d’un import réussi.
2. Scorer chacune (`score_parsing` ; optionnel `verify-pdf` sur (a)/(c)).
3. UI chooser Beta (cartes avant / score / « Continuer avec… »).
4. Refus clair `.doc` + scanned sans OCR (« texte non extractible »).

**Out (V2)**

- OCR, import `.doc`, reconstruction Word mm, mapping freeform → blocs sémantiques complets.

---

## Backlog d'implémentation (tickets enfants)

Créés sous le projet Éditeur / milestone P4, parent [AXE-41](https://linear.app/axel-project/issue/AXE-41) :

| Ticket | Titre | Priorité |
|--------|-------|----------|
| [AXE-324](https://linear.app/axel-project/issue/AXE-324) | Feat: Générer 3 variantes layout à l'import (ATS-safe / structurel / mix) | High — service FE `frontend/src/lib/importLayoutVariants.js` |
| [AXE-325](https://linear.app/axel-project/issue/AXE-325) | Feat: Scorer les 3 sorties d'import (`ats_score` + delta) | High — FE `scoreImportLayoutVariants.js` + BE `import_variant_scoring.py` |
| [AXE-326](https://linear.app/axel-project/issue/AXE-326) | Feat: UI chooser import Beta (preview + score + confirmation) | High |
| [AXE-327](https://linear.app/axel-project/issue/AXE-327) | Improve: Durcir Word (tables/runs) + refus `.doc` explicite | Medium |
| [AXE-328](https://linear.app/axel-project/issue/AXE-328) | Improve: Policy PDF scanné — message UX, pas d'OCR MVP | Medium |
| [AXE-329](https://linear.app/axel-project/issue/AXE-329) | Improve: Lier freeform structurel → blocs sémantiques éditables | Low |

---

## Suivi nits review PR

| Nit review PR | Suivi |
|---------------|--------|
| Duplication extracteurs `main.py` | Reporter dans AXE-324 (util partagé) |
| Raison `structural_ok=False` | Champ `structural_reason` ajouté au probe |
| Tests edge (extension / PDF vide) | Couvert dans `test_cv_import_probe.py` |

## Critères d'acceptation du spike — checklist

- [x] Note faisabilité + risques + MVP (ce document)
- [x] Démo extraction sur 3 CV (+ DOCX) sans Gemini
- [x] Libs documentées (stack actuelle conservée)
- [x] Backlog enfants créé dans Linear
- [ ] Hors spike : UI 3 sorties (AXE-324 → 326)
