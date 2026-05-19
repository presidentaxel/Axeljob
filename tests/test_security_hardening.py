"""Tests des durcissements sécurité (CSS, Jinja sandbox)."""

import unittest


class TestCssSanitize(unittest.TestCase):
    def test_strips_style_close(self) -> None:
        from backend.css_sanitize import sanitize_css_for_style_tag

        raw = "body{color:red}</style><script>alert(1)</script>"
        out = sanitize_css_for_style_tag(raw)
        self.assertNotIn("</style", out.lower())
        self.assertIn("body{color:red}", out)

    def test_strips_script_tags(self) -> None:
        from backend.css_sanitize import sanitize_css_for_style_tag

        raw = "a{color:blue}<script>evil</script>"
        out = sanitize_css_for_style_tag(raw)
        self.assertNotIn("<script", out.lower())

    def test_null_bytes(self) -> None:
        from backend.css_sanitize import sanitize_css_for_style_tag

        out = sanitize_css_for_style_tag("x\x00y")
        self.assertNotIn("\x00", out)


class TestJinjaSandboxCustomTemplate(unittest.TestCase):
    def test_sandbox_blocks_class_access(self) -> None:
        try:
            from jinja2 import select_autoescape
            from jinja2.sandbox import SandboxedEnvironment, SecurityError
        except ImportError:
            self.skipTest("jinja2 requis (pip install -r backend/requirements.txt)")

        env = SandboxedEnvironment(autoescape=select_autoescape(("html", "xml")))
        tpl = env.from_string("{{ ''.__class__.__mro__[1].__subclasses__() }}")
        with self.assertRaises(SecurityError):
            tpl.render()


if __name__ == "__main__":
    unittest.main()
