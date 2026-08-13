"""Contrat du handler ``handle_verify_pdf`` (AXE-39)."""

from __future__ import annotations

import base64
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import main
from backend.api_ats import VerifyPdfBody, handle_verify_pdf


def _text_pdf(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((40, 72), text, fontsize=11)
    out = doc.tobytes()
    doc.close()
    return out


def _starter_layout() -> dict:
    return {
        "version": 3,
        "theme": {"color_accent": "#1e3a5f"},
        "pages": [
            {
                "id": "p1",
                "blocks": [
                    {
                        "id": "b-identity",
                        "type": "identity",
                        "bind": ["prenom", "nom", "titre_professionnel"],
                        "x": 10,
                        "y": 10,
                        "w": 190,
                        "h": 22,
                        "z": 1,
                    },
                    {
                        "id": "b-contact",
                        "type": "contact",
                        "x": 10,
                        "y": 35,
                        "w": 190,
                        "h": 14,
                        "z": 1,
                    },
                    {
                        "id": "b-resume",
                        "type": "resume",
                        "bind": "resume",
                        "x": 10,
                        "y": 52,
                        "w": 190,
                        "h": 24,
                        "z": 1,
                    },
                ],
            }
        ],
    }


def _cv() -> dict:
    path = Path(__file__).resolve().parent / "fixtures" / "ats_score" / "cv_standard.json"
    cv = json.loads(path.read_text(encoding="utf-8"))
    cv["photo_url"] = ""
    return cv


class _FakeRequest:
    def __init__(self) -> None:
        self.headers = {}
        self.state = SimpleNamespace()


class TestHandleVerifyPdf(unittest.TestCase):
    def test_pdf_base64_returns_scores_and_delta(self):
        cv = _cv()
        text = (
            f"{cv['prenom']} {cv['nom']}\n{cv['titre_professionnel']}\n"
            f"{cv['email']}\n{cv['telephone']}\n{cv['resume']}"
        )
        body = VerifyPdfBody(
            cv=cv,
            layout=_starter_layout(),
            pdf_base64=base64.b64encode(_text_pdf(text)).decode("ascii"),
        )
        payload = handle_verify_pdf(body)
        self.assertIn("score_json", payload)
        self.assertIn("score_pdf", payload)
        self.assertIn("delta_total", payload)
        self.assertIn("rules_diff", payload)
        self.assertIn("ground_truth", payload)
        self.assertIn("block_ids_divergent", payload)
        self.assertEqual(payload["score_json"]["kind"], "parsing")
        self.assertTrue(payload["within_threshold"])
        self.assertTrue(payload["ground_truth"]["all_critical_fields_present"])

    def test_raster_pdf_lowers_score_pdf(self):
        import fitz

        doc = fitz.open()
        doc.new_page()
        blank = doc.tobytes()
        doc.close()
        body = VerifyPdfBody(
            cv=_cv(),
            layout=_starter_layout(),
            pdf_base64=base64.b64encode(blank).decode("ascii"),
        )
        payload = handle_verify_pdf(body)
        self.assertLess(payload["score_pdf"]["total"], payload["score_json"]["total"])
        self.assertLess(payload["delta_total"], 0)
        self.assertIn("gt_raster_pdf", payload["rules_diff"]["only_pdf"])

    def test_invalid_pdf_base64_raises_400(self):
        body = VerifyPdfBody(layout=_starter_layout(), pdf_base64="not-a-pdf")
        with self.assertRaises(HTTPException) as ctx:
            handle_verify_pdf(body)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_requires_layout_or_template(self):
        with self.assertRaises(HTTPException) as ctx:
            handle_verify_pdf(VerifyPdfBody())
        self.assertEqual(ctx.exception.status_code, 400)


class TestHandleVerifyPdfGenerate(unittest.TestCase):
    def test_generates_pdf_from_free_canvas_layout(self):
        try:
            import weasyprint  # noqa: F401
        except ImportError:
            self.skipTest("WeasyPrint indisponible")
        body = VerifyPdfBody(cv=_cv(), layout=_starter_layout())
        payload = handle_verify_pdf(body)
        self.assertTrue(payload["within_threshold"])
        self.assertGreater(payload["ground_truth"]["text_chars_pdfplumber"], 20)
        self.assertTrue(payload["ground_truth"]["all_critical_fields_present"])


class TestTemplateDirIsolation(unittest.TestCase):
    def test_layout_without_pages_requires_template_id(self):
        body = VerifyPdfBody(
            cv=_cv(),
            layout={"grid": "single-or-sidebar", "sidebar_ratio": 0.0},
        )
        with self.assertRaises(HTTPException) as ctx:
            handle_verify_pdf(body)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("template_id", ctx.exception.detail)


class TestRouteVerifyPdf(unittest.TestCase):
    def test_route_wires_rate_limit_and_payload(self):
        cv = _cv()
        text = f"{cv['prenom']} {cv['nom']}\n{cv['email']}\n{cv['telephone']}"
        body = VerifyPdfBody(
            cv=cv,
            layout=_starter_layout(),
            pdf_base64=base64.b64encode(_text_pdf(text)).decode("ascii"),
        )
        with (
            patch.object(main, "_get_user_id", return_value="user_verify"),
            patch.object(main, "check_rate_limit") as rl_mock,
        ):
            payload = main.api_ats_verify_pdf(_FakeRequest(), body)
        rl_mock.assert_called_once_with("user_verify", 20, scope="ats_verify_pdf")
        self.assertIn("score_json", payload)
        self.assertIn("delta_total", payload)


if __name__ == "__main__":
    unittest.main()
