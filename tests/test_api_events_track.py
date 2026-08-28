"""POST /api/events/track — whitelist frontend (AXE-394).

Appelle le handler directement (pas de TestClient), comme
``tests/test_api_ats_route.py``.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend import event_log, main


class _FakeRequest:
    def __init__(self) -> None:
        self.headers = {}
        self.state = SimpleNamespace()


ORPHANS = (
    (
        event_log.EVENT_BASE_CV_PDF_DOWNLOADED,
        {"template_id": "minimal", "source": "cv_tab"},
    ),
    (
        event_log.EVENT_FIRST_OFFER_NUDGE_CTA,
        {"action": "go_cv"},
    ),
    (
        event_log.EVENT_NEW_CANDIDATURE_WORKSPACE,
        {"had_adapted_cv": True},
    ),
)


class TestAllowedFrontendEvents(unittest.TestCase):
    def test_orphan_names_are_whitelisted(self):
        for name, _ctx in ORPHANS:
            self.assertIn(name, main._ALLOWED_FRONTEND_EVENTS)

    def test_login_is_whitelisted(self):
        self.assertIn(event_log.EVENT_LOGIN, main._ALLOWED_FRONTEND_EVENTS)
        self.assertEqual(event_log.EVENT_LOGIN, "login")

    def test_frozen_strings(self):
        self.assertEqual(event_log.EVENT_BASE_CV_PDF_DOWNLOADED, "base_cv_pdf_downloaded")
        self.assertEqual(event_log.EVENT_FIRST_OFFER_NUDGE_CTA, "first_offer_nudge_cta")
        self.assertEqual(event_log.EVENT_NEW_CANDIDATURE_WORKSPACE, "new_candidature_workspace")


class TestRouteRejectsUnknown(unittest.TestCase):
    def test_unknown_event_returns_400(self):
        body = main.TrackEventBody(event_type="not_a_real_event", context={})
        with self.assertRaises(HTTPException) as ctx:
            main.api_events_track(_FakeRequest(), body)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Event type non autorisé")


class TestRouteAcceptsOrphans(unittest.TestCase):
    def test_each_orphan_logs_and_returns_ok(self):
        for event_type, context in ORPHANS:
            body = main.TrackEventBody(event_type=event_type, context=context)
            with (
                patch.object(main, "_get_user_id", return_value="user_test"),
                patch.object(main.event_log, "log_event") as mock_log,
            ):
                out = main.api_events_track(_FakeRequest(), body)
            self.assertEqual(out, {"ok": True})
            mock_log.assert_called_once()
            args, kwargs = mock_log.call_args
            self.assertEqual(args[0], event_type)
            self.assertEqual(args[1], "user_test")
            self.assertEqual(args[2], context)


class TestRouteAcceptsLogin(unittest.TestCase):
    def test_login_logs_and_returns_ok(self):
        body = main.TrackEventBody(event_type=event_log.EVENT_LOGIN, context={"method": "google"})
        with (
            patch.object(main, "_get_user_id", return_value="user_test"),
            patch.object(main.event_log, "log_event") as mock_log,
        ):
            out = main.api_events_track(_FakeRequest(), body)
        self.assertEqual(out, {"ok": True})
        mock_log.assert_called_once()
        self.assertEqual(mock_log.call_args.args[0], "login")
        self.assertEqual(mock_log.call_args.args[2], {"method": "google"})


if __name__ == "__main__":
    unittest.main()
