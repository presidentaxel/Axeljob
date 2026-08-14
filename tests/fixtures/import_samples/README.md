# Fixtures import PDF/Word (AXE-41)

Samples **anonymisés / fictifs** pour la démo spike et les tests CI.

| Fichier | Format | Cas |
|---------|--------|-----|
| `01_single_column.pdf` | PDF natif | Mono-colonne ATS-friendly |
| `02_sidebar.pdf` | PDF natif | Sidebar colorée + texte |
| `03_dense_multisection.pdf` | PDF natif | Dense (XP, projets, certifs…) |
| `04_single_column.docx` | Word | Parité contenu sans layout mm |
| `05_with_table.docx` | Word | Contenu en tableau + soft break (AXE-327) |

Régénération :

```bash
PYTHONPATH=. python backend/scripts/generate_import_samples.py
```

Ne pas committer de vrais CV personnels.
