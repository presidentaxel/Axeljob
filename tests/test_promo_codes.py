"""Tests unitaires codes promo."""

import unittest
from unittest.mock import MagicMock, patch

from backend.promo_codes import normalize_promo_code, redeem_promo_code


class TestNormalizePromoCode(unittest.TestCase):
    def test_normalizes_case(self):
        self.assertEqual(normalize_promo_code(" welcome3 "), "WELCOME3")

    def test_rejects_short(self):
        self.assertEqual(normalize_promo_code("ab"), "")

    def test_rejects_special(self):
        self.assertEqual(normalize_promo_code("bad code!"), "")


class TestRedeemPromoCodePg(unittest.TestCase):
    @patch("backend.config.USE_SUPABASE_PG", True)
    @patch("backend.supabase_pg.redeem_promo_code_pg")
    def test_delegates_to_pg(self, mock_pg):
        mock_pg.return_value = {"ok": True, "message": "ok", "bonus_added": 3}
        out = redeem_promo_code("user-1", "WELCOME3")
        self.assertTrue(out["ok"])
        mock_pg.assert_called_once_with("user-1", "WELCOME3")


if __name__ == "__main__":
    unittest.main()
