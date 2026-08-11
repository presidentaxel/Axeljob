"""Validation / sanitisation layout v3 (AXE-40)."""

from __future__ import annotations

import base64
import unittest

from backend.services.layout_sanitize import LayoutValidationError, sanitize_layout_v3


def _png_data_url() -> str:
    # 1x1 PNG
    raw = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


class TestLayoutSanitize(unittest.TestCase):
    def test_rejects_non_object(self) -> None:
        with self.assertRaises(LayoutValidationError):
            sanitize_layout_v3([])

    def test_rejects_bad_version(self) -> None:
        with self.assertRaises(LayoutValidationError):
            sanitize_layout_v3({"version": 2, "pages": [{"blocks": []}]})

    def test_rejects_empty_pages(self) -> None:
        with self.assertRaises(LayoutValidationError):
            sanitize_layout_v3({"version": 3, "pages": []})

    def test_sanitizes_text_content_and_preserves_meta(self) -> None:
        layout = {
            "version": 3,
            "format": "A4",
            "grid": "free",
            "unit": "mm",
            "theme": {"color_accent": "#111"},
            "pages": [
                {
                    "id": "p1",
                    "blocks": [
                        {
                            "id": "t1",
                            "type": "text",
                            "content": "<b>Hi</b><script>x</script>",
                            "x": 1,
                            "y": 2,
                            "w": 30,
                            "h": 10,
                            "z": 1,
                        }
                    ],
                }
            ],
        }
        out = sanitize_layout_v3(layout)
        self.assertEqual(out["format"], "A4")
        self.assertEqual(out["grid"], "free")
        self.assertEqual(out["theme"]["color_accent"], "#111")
        self.assertEqual(out["pages"][0]["blocks"][0]["content"], "<strong>Hi</strong>")

    def test_materializes_data_url_image(self) -> None:
        captured: list[tuple[bytes, str]] = []

        def mat(raw: bytes, mime: str) -> str:
            captured.append((raw, mime))
            return "assets/uploads/user/canvas_x.jpg"

        layout = {
            "version": 3,
            "pages": [
                {
                    "blocks": [
                        {
                            "id": "img1",
                            "type": "image",
                            "image_src": _png_data_url(),
                            "x": 0,
                            "y": 0,
                            "w": 20,
                            "h": 20,
                            "z": 1,
                        }
                    ]
                }
            ],
        }
        out = sanitize_layout_v3(layout, materialize_image=mat)
        self.assertEqual(
            out["pages"][0]["blocks"][0]["image_src"], "assets/uploads/user/canvas_x.jpg"
        )
        self.assertEqual(len(captured), 1)
        self.assertTrue(captured[0][0].startswith(b"\x89PNG"))

    def test_drops_data_url_without_materialize(self) -> None:
        layout = {
            "version": 3,
            "pages": [
                {
                    "blocks": [
                        {
                            "id": "img1",
                            "type": "image",
                            "image_src": _png_data_url(),
                            "x": 0,
                            "y": 0,
                            "w": 20,
                            "h": 20,
                            "z": 1,
                        }
                    ]
                }
            ],
        }
        out = sanitize_layout_v3(layout)
        self.assertEqual(out["pages"][0]["blocks"][0]["image_src"], "")


if __name__ == "__main__":
    unittest.main()
