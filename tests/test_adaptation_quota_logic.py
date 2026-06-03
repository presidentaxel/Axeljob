"""Comptages quota adaptations (sans dépendre de Supabase ni de pytest en optionnel)."""

import unittest

from backend import db


class TestAdaptationQuotaRow(unittest.TestCase):
    def test_manual_prefix_excluded(self):
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "manual_abc123",
                {"full_cv": {"nom": "X"}, "archived": False},
            )
        )

    def test_requires_non_empty_full_cv(self):
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"archived": False},
            )
        )
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {}, "archived": False},
            )
        )

    def test_archived_excluded(self):
        self.assertFalse(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {"nom": "X"}, "archived": True},
            )
        )

    def test_ai_row_counts(self):
        self.assertTrue(
            db._application_counts_toward_adaptation_quota(
                "adapt_123",
                {"full_cv": {"nom": "X"}, "archived": False},
            )
        )


class TestActiveApplicationRow(unittest.TestCase):
    def test_archived_inactive(self):
        self.assertFalse(db._application_is_active_non_archived({"archived": True}))

    def test_active_default(self):
        self.assertTrue(db._application_is_active_non_archived({}))
        self.assertTrue(db._application_is_active_non_archived({"archived": False}))
