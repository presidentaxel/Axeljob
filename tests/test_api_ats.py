"""Contrat du handler ``handle_score_parsing`` (route API ATS)."""

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException

from backend import api_ats
from backend.api_ats import (
    ScoreParsingBody,
    handle_score_parsing,
    resolve_layout_for_scoring,
)


class TestResolveLayoutForScoring(unittest.TestCase):
    def test_returns_layout_when_provided(self):
        layout = {"grid": "single-or-sidebar", "sidebar_ratio": 0.0}
        self.assertEqual(resolve_layout_for_scoring(layout, None), layout)

    def test_raises_400_when_nothing_provided(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_layout_for_scoring(None, None)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_raises_400_when_layout_empty_and_no_template(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_layout_for_scoring({}, None)
        self.assertEqual(ctx.exception.status_code, 400)


class TestTemplateResolution(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        template_dir = self.dir / "demo"
        template_dir.mkdir()
        (template_dir / "meta.json").write_text(
            json.dumps({"id": "demo", "tags": ["single-column", "no-sidebar"]}),
            encoding="utf-8",
        )
        api_ats.set_templates_dir(self.dir)

    def tearDown(self) -> None:
        api_ats.reset_templates_dir()
        self.tmp.cleanup()

    def test_resolves_layout_from_template_id(self):
        layout = resolve_layout_for_scoring(None, "demo")
        self.assertEqual(layout["template_id"], "demo")
        self.assertEqual(layout["sidebar_ratio"], 0.0)

    def test_raises_404_when_template_missing(self):
        with self.assertRaises(HTTPException) as ctx:
            resolve_layout_for_scoring(None, "ghost")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_raises_400_when_template_id_contains_path_traversal(self):
        # Regression : empecher la fuite hors du dossier templates/.
        for bad in ["../etc/passwd", "demo/sub", "a/../b"]:
            with self.assertRaises(HTTPException) as ctx:
                resolve_layout_for_scoring(None, bad)
            self.assertEqual(ctx.exception.status_code, 400)

    def test_raises_500_when_template_meta_is_corrupt(self):
        broken = self.dir / "broken"
        broken.mkdir()
        (broken / "meta.json").write_text("{not json}", encoding="utf-8")
        with self.assertRaises(HTTPException) as ctx:
            resolve_layout_for_scoring(None, "broken")
        self.assertEqual(ctx.exception.status_code, 500)


class TestHandleScoreParsing(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        template_dir = self.dir / "demo"
        template_dir.mkdir()
        (template_dir / "meta.json").write_text(
            json.dumps({"id": "demo", "tags": ["single-column", "no-sidebar"]}),
            encoding="utf-8",
        )
        api_ats.set_templates_dir(self.dir)

    def tearDown(self) -> None:
        api_ats.reset_templates_dir()
        self.tmp.cleanup()

    def test_returns_score_payload_with_template_id(self):
        body = ScoreParsingBody(template_id="demo")
        payload = handle_score_parsing(body)
        self.assertEqual(payload["kind"], "parsing")
        self.assertIsInstance(payload["total"], int)
        self.assertIsInstance(payload["version"], str)
        self.assertIsInstance(payload["rules"], list)

    def test_returns_score_with_explicit_layout(self):
        body = ScoreParsingBody(
            cv={"prenom": "X"},
            layout={"grid": "single-or-sidebar", "sidebar_ratio": 0.0},
        )
        payload = handle_score_parsing(body)
        self.assertGreaterEqual(payload["total"], 0)
        self.assertLessEqual(payload["total"], 100)

    def test_serialized_rules_have_expected_shape(self):
        body = ScoreParsingBody(template_id="demo")
        payload = handle_score_parsing(body)
        for rule in payload["rules"]:
            self.assertEqual(set(rule), {"id", "label", "delta", "severity"})


if __name__ == "__main__":
    unittest.main()
