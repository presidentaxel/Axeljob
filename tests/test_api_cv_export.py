"""Tests de contrat pour ``POST /api/cv-export`` (AXE-330).

Appelle le handler FastAPI directement (même modèle que ``test_api_ats_route``).
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.responses import Response

from backend import main


class _FakeRequest:
    def __init__(self) -> None:
        self.headers = {}
        self.state = SimpleNamespace()


def _body(**kwargs):
    base = {
        "cv": {"prenom": "Ada", "nom": "Lovelace", "email": "ada@example.com"},
        "format": "txt",
    }
    base.update(kwargs)
    return main.CvExportBody(**base)


class TestCvExportFormatValidation(unittest.TestCase):
    def test_rejects_unsupported_format(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_export(_FakeRequest(), _body(format="png"))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Format non supporté", str(ctx.exception.detail))


class TestCvExportTxt(unittest.TestCase):
    def test_txt_returns_plain_text_attachment(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit") as rl_mock,
        ):
            resp = main.api_cv_export(_FakeRequest(), _body(format="txt"))
        self.assertIsInstance(resp, Response)
        self.assertEqual(resp.media_type, "text/plain; charset=utf-8")
        self.assertIn("Ada Lovelace", resp.body.decode("utf-8"))
        self.assertIn('attachment; filename="', resp.headers.get("content-disposition", ""))
        self.assertTrue(resp.headers.get("content-disposition", "").endswith('.txt"'))
        rl_mock.assert_called_once_with("user_test", 10, scope="cv_export")

    def test_txt_empty_cv_returns_400(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_export(_FakeRequest(), _body(cv={}, format="txt"))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("texte", str(ctx.exception.detail).lower())


class TestCvExportDocx(unittest.TestCase):
    def test_docx_returns_ooxml_attachment(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
        ):
            resp = main.api_cv_export(_FakeRequest(), _body(format="docx"))
        self.assertIsInstance(resp, Response)
        self.assertIn("wordprocessingml", resp.media_type or "")
        self.assertEqual(resp.body[:2], b"PK")
        self.assertTrue(resp.headers.get("content-disposition", "").endswith('.docx"'))

    def test_docx_empty_cv_returns_400(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_export(_FakeRequest(), _body(cv={}, format="docx"))
        self.assertEqual(ctx.exception.status_code, 400)


class TestCvExportHtmlPdf(unittest.TestCase):
    def test_html_returns_html_attachment(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
            patch.object(main, "_check_premium_template"),
            patch.object(main, "_check_custom_template_access"),
            patch.object(main, "_render_cv_html", return_value="<html>cv</html>"),
            patch.object(main, "USE_SUPABASE", False),
        ):
            resp = main.api_cv_export(_FakeRequest(), _body(format="html", template_id="minimal"))
        self.assertEqual(resp.media_type, "text/html; charset=utf-8")
        self.assertIn(b"<html>cv</html>", resp.body)
        self.assertTrue(resp.headers.get("content-disposition", "").endswith('.html"'))

    def test_pdf_reuses_pdf_pipeline(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
            patch.object(main, "_check_premium_template"),
            patch.object(main, "_check_custom_template_access"),
            patch.object(
                main,
                "_cv_pdf_bytes_same_as_download",
                return_value=(b"%PDF-1.4", "CV-Ada.pdf"),
            ),
            patch.object(main, "_track_analytics"),
            patch.object(main, "PDF_COUNT") as pdf_count,
            patch("backend.cv_pdf_dispatch.cv_pdf_engine", return_value="weasy"),
        ):
            resp = main.api_cv_export(_FakeRequest(), _body(format="pdf", template_id="minimal"))
        self.assertEqual(resp.media_type, "application/pdf")
        self.assertEqual(resp.body, b"%PDF-1.4")
        self.assertIn("CV-Ada.pdf", resp.headers.get("content-disposition", ""))
        pdf_count.inc.assert_called_once()

    def test_html_runs_premium_and_custom_template_checks(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
            patch.object(
                main,
                "_check_premium_template",
                side_effect=HTTPException(status_code=403, detail="premium"),
            ) as premium,
            patch.object(main, "_check_custom_template_access") as custom,
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_export(_FakeRequest(), _body(format="html", template_id="pro_tpl"))
        self.assertEqual(ctx.exception.status_code, 403)
        premium.assert_called_once()
        custom.assert_not_called()

    def test_txt_skips_template_access_checks(self):
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
            patch.object(main, "_check_premium_template") as premium,
            patch.object(main, "_check_custom_template_access") as custom,
        ):
            main.api_cv_export(_FakeRequest(), _body(format="txt", template_id="pro_tpl"))
        premium.assert_not_called()
        custom.assert_not_called()


if __name__ == "__main__":
    unittest.main()
