#!/usr/bin/env python3
"""Demo offline d'extraction import CV (AXE-41).

Usage :

    PYTHONPATH=. python backend/scripts/demo_import_extract.py
    PYTHONPATH=. python backend/scripts/demo_import_extract.py --json

Sans Gemini : texte + heuristiques de sections + layout structurel PDF.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SAMPLES = REPO / "tests" / "fixtures" / "import_samples"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Demo extraction import samples AXE-41")
    parser.add_argument("--json", action="store_true", help="Sortie JSON complete")
    parser.add_argument(
        "--dir",
        type=Path,
        default=SAMPLES,
        help="Dossier des fixtures (defaut: tests/fixtures/import_samples)",
    )
    args = parser.parse_args(argv)

    sys.path.insert(0, str(REPO))
    from backend.services.cv_import_probe import probe_import_file

    if not args.dir.is_dir():
        print(f"Dossier introuvable : {args.dir}", file=sys.stderr)
        print("Generer via : PYTHONPATH=. python backend/scripts/generate_import_samples.py")
        return 1

    files = sorted(
        [*args.dir.glob("*.pdf"), *args.dir.glob("*.docx")],
        key=lambda p: p.name,
    )
    if not files:
        print(f"Aucun sample dans {args.dir}", file=sys.stderr)
        return 1

    reports = []
    for path in files:
        report = probe_import_file(path)
        reports.append(report)
        if not args.json:
            sec = report["sections"]
            print(f"== {report['name']} ({report['kind']}, {report['bytes']} B) ==")
            print(
                f"  chars={sec['char_count']}  email={sec['has_email']}  phone={sec['has_phone']}"
            )
            print(f"  headings={sec['headings_found']}")
            print(
                f"  structural_ok={report['structural_ok']}  "
                f"blocks={report['structural_block_count']}"
            )
            print()

    if args.json:
        print(json.dumps(reports, ensure_ascii=False, indent=2))
    else:
        ok_pdf = sum(1 for r in reports if r["kind"] == "pdf" and r["structural_ok"])
        print(f"Resume : {len(reports)} fichiers, {ok_pdf} PDF avec layout structurel.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
