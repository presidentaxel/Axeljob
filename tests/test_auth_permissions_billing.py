import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import main
from backend.services import billing_notifications


class _FakeRequest:
    def __init__(self, auth_header: str | None = None):
        self.headers = {}
        if auth_header is not None:
            self.headers["Authorization"] = auth_header
        self.state = SimpleNamespace()


class TestAuthGuards(unittest.TestCase):
    def test_require_user_id_raises_when_supabase_enabled_without_user(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main._require_user_id(req)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_user_id_returns_default_when_supabase_disabled(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", False),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            self.assertEqual(main._require_user_id(req), "default")


class TestTemplatePermissions(unittest.TestCase):
    def test_check_custom_template_access_denied(self):
        with patch("backend.db.can_user_use_custom_template", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                main._check_custom_template_access("user_1", "custom_abc")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_check_premium_template_denied_for_free(self):
        with (
            patch("backend.template_registry.get_template", return_value={"premium": True}),
            patch.object(main, "get_user_plan", return_value="free"),
            patch.object(main, "get_paywall_disabled", return_value=False),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main._check_premium_template("user_1", "modern_premium")
        self.assertEqual(ctx.exception.status_code, 402)


class TestBillingHelpers(unittest.TestCase):
    def test_primary_frontend_base_url_first_origin(self):
        out = billing_notifications.primary_frontend_base_url(
            "https://a.example, https://b.example"
        )
        self.assertEqual(out, "https://a.example")

    def test_send_template_perso_email_returns_false_without_key(self):
        sent = billing_notifications.send_template_perso_email(
            to_email="test@example.com",
            resend_api_key="",
            resend_from_email="AxeL Job <onboarding@resend.dev>",
            frontend_url="https://job.example.com",
            support_email="support@example.com",
        )
        self.assertFalse(sent)


if __name__ == "__main__":
    unittest.main()
