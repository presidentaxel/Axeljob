"""AXE-328 — policy PDF scanné (refus OCR) + fallback layout."""

from __future__ import annotations

import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend import main
from backend.services.pdf_import_policy import (
    LAYOUT_FALLBACK_TEXT_AI,
    LAYOUT_MODE_STRUCTURAL,
    PDF_SCANNED_REFUSAL_DETAIL,
    build_pdf_import_policy,
    is_insufficient_import_text,
)


def _blank_pdf_bytes() -> bytes:
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    data = doc.tobytes()
    doc.close()
    return data


class TestPdfImportPolicyHelpers(unittest.TestCase):
    def test_insufficient_text(self):
        self.assertTrue(is_insufficient_import_text(""))
        self.assertTrue(is_insufficient_import_text("court"))
        self.assertFalse(is_insufficient_import_text("x" * 50))

    def test_build_policy_structural(self):
        policy = build_pdf_import_policy(
            structural_layout={"pages": [{"blocks": [1]}]},
            vision_meta={},
        )
        self.assertFalse(policy["ocr"])
        self.assertTrue(policy["pdf_native_layout"])
        self.assertEqual(policy["layout_mode"], LAYOUT_MODE_STRUCTURAL)
        self.assertIsNone(policy["layout_fallback"])
        self.assertIsNone(policy["message"])

    def test_build_policy_fallback(self):
        policy = build_pdf_import_policy(
            structural_layout=None,
            vision_meta={"source": "gemini_vision"},
        )
        self.assertFalse(policy["ocr"])
        self.assertFalse(policy["pdf_native_layout"])
        self.assertEqual(policy["layout_mode"], LAYOUT_FALLBACK_TEXT_AI)
        self.assertEqual(policy["layout_fallback"], LAYOUT_FALLBACK_TEXT_AI)
        self.assertTrue(policy["vision_used"])
        self.assertIn("OCR", policy["message"] or "")


class TestApiCvImportScannedPdf(unittest.TestCase):
    def test_blank_pdf_returns_400_scanned_message(self):
        req = SimpleNamespace(headers={}, state=SimpleNamespace())
        upload = MagicMock()
        upload.filename = "scan.pdf"
        upload.content_type = "application/pdf"
        upload.file = BytesIO(_blank_pdf_bytes())

        with (
            patch.object(main, "_require_user_id"),
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main, "check_rate_limit"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_import_file(req, upload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, PDF_SCANNED_REFUSAL_DETAIL)
        self.assertIn("OCR", ctx.exception.detail)
        self.assertIn(".docx", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
