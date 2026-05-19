import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import main


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

    def test_api_cv_put_requires_auth_when_supabase_enabled(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_put(req, {})
        self.assertEqual(ctx.exception.status_code, 401)

    def test_import_linkedin_photo_requires_auth_when_supabase_enabled(self):
        req = _FakeRequest()
        body = main.FetchLinkedInBody(linkedin_access_token="tok")
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_import_linkedin_photo(req, body)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_cv_put_payload_rejects_oversized_object(self):
        req = _FakeRequest()
        huge = {f"k{i}": "v" for i in range(400)}
        with patch.object(main, "_require_user_id", return_value="user_1"):
            with self.assertRaises(HTTPException) as ctx:
                main.api_cv_put(req, huge)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_application_create_requires_auth_when_supabase_enabled(self):
        req = _FakeRequest()
        body = main.ApplicationCreateBody(
            poste="Dev", entreprise="Acme", statut="candidature_envoyee"
        )
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_application_create(req, body)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_applications_list_requires_auth_when_supabase_enabled(self):
        req = _FakeRequest()
        with (
            patch.object(main, "USE_SUPABASE", True),
            patch.object(main, "_get_user_id", return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                main.api_applications_list(req)
        self.assertEqual(ctx.exception.status_code, 401)


class TestTemplatePermissions(unittest.TestCase):
    def test_check_custom_template_access_denied_when_not_owner(self):
        with patch("backend.db.can_user_use_custom_template", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                main._check_custom_template_access("user_1", "custom_abc")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_check_custom_template_access_noop_for_builtin(self):
        # Les templates non-custom passent toujours (plus de paywall premium).
        self.assertIsNone(main._check_custom_template_access("user_1", "modern"))

    def test_check_premium_template_is_noop(self):
        # Le paywall premium a été désactivé : aucune exception attendue.
        self.assertIsNone(main._check_premium_template("user_1", "bold"))


if __name__ == "__main__":
    unittest.main()
