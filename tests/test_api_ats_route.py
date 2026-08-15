"""Tests d'integration de la route ``POST /api/ats/score-parsing``.

On appelle le handler FastAPI directement (pas de TestClient), sur le modele
de ``tests/test_auth_permissions_billing.py``. Couvre :

- contrat de reponse (cle ``total``, ``rules``, ``kind``, ``version``) ;
- branchement effectif du rate-limit ;
- propagation des HTTPException du handler pur.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import main
from backend.api_ats import ScoreParsingBody


class _FakeRequest:
    def __init__(self) -> None:
        self.headers = {}
        self.state = SimpleNamespace()


class TestRouteHappyPath(unittest.TestCase):
    def test_route_returns_payload_for_existing_template(self):
        body = ScoreParsingBody(template_id="minimal")
        with patch.object(main, "_get_user_id", return_value="user_test"):
            payload = main.api_ats_score_parsing(_FakeRequest(), body)
        self.assertEqual(payload["kind"], "parsing")
        self.assertIn("total", payload)
        self.assertIn("rules", payload)
        self.assertEqual(payload["version"], "2026.08.1")

    def test_route_returns_payload_for_explicit_layout(self):
        body = ScoreParsingBody(layout={"grid": "single-or-sidebar", "sidebar_ratio": 0.0})
        with patch.object(main, "_get_user_id", return_value=None):
            payload = main.api_ats_score_parsing(_FakeRequest(), body)
        self.assertGreaterEqual(payload["total"], 0)
        self.assertLessEqual(payload["total"], 100)


class TestRouteErrors(unittest.TestCase):
    def test_route_raises_400_when_no_layout_no_template(self):
        body = ScoreParsingBody()
        with patch.object(main, "_get_user_id", return_value="user_test"):
            with self.assertRaises(HTTPException) as ctx:
                main.api_ats_score_parsing(_FakeRequest(), body)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_route_raises_404_for_unknown_template(self):
        body = ScoreParsingBody(template_id="this_template_does_not_exist")
        with patch.object(main, "_get_user_id", return_value="user_test"):
            with self.assertRaises(HTTPException) as ctx:
                main.api_ats_score_parsing(_FakeRequest(), body)
        self.assertEqual(ctx.exception.status_code, 404)


class TestRouteRateLimitIsCalled(unittest.TestCase):
    def test_rate_limit_invoked_with_ats_scope(self):
        # Regression : si on oublie le rate-limit, on ouvre un endpoint
        # potentiellement abusif (calcul cheap mais I/O fichier templates).
        body = ScoreParsingBody(template_id="minimal")
        with (
            patch.object(main, "_get_user_id", return_value="user_42"),
            patch.object(main, "check_rate_limit") as rl_mock,
        ):
            main.api_ats_score_parsing(_FakeRequest(), body)
        rl_mock.assert_called_once_with("user_42", 60, scope="ats_score")


if __name__ == "__main__":
    unittest.main()
