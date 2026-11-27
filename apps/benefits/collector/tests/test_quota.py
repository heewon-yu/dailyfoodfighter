import os
import tempfile
import unittest
from unittest.mock import patch

from quota import DailyQuotaExhausted, quota_config, reserve

class QuotaTests(unittest.TestCase):
    def test_missing_approved_quota_blocks_calls(self):
        with patch.dict(os.environ, {"GOV24_APPROVED_DAILY_CALLS": ""}):
            with self.assertRaisesRegex(RuntimeError, "not configured"):
                quota_config("GOV24")

    def test_90_percent_budget_survives_multiple_calls(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {
                "STATE_DIR": root,
                "GOV24_APPROVED_DAILY_CALLS": "10",
                "API_BUDGET_PERCENT": "90",
            }):
                for n in range(1, 10):
                    self.assertEqual(reserve("GOV24"), (n, 9))
                with self.assertRaises(DailyQuotaExhausted):
                    reserve("GOV24")

    def test_bizinfo_and_gov24_have_independent_budgets(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {
                "STATE_DIR": root,
                "GOV24_APPROVED_DAILY_CALLS": "10",
                "BIZINFO_APPROVED_DAILY_CALLS": "10",
                "API_BUDGET_PERCENT": "80",
            }):
                for _ in range(8): reserve("GOV24")
                self.assertEqual(reserve("BIZINFO"), (1, 8))
                with self.assertRaises(DailyQuotaExhausted): reserve("GOV24")

    def test_100_percent_budget_allows_exactly_approved_calls(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {
                "STATE_DIR": root,
                "GOV24_APPROVED_DAILY_CALLS": "10",
                "BIZINFO_APPROVED_DAILY_CALLS": "3",
                "API_BUDGET_PERCENT": "100",
            }):
                self.assertEqual(quota_config("GOV24"), (10, 10))
                self.assertEqual(quota_config("BIZINFO"), (3, 3))
                for n in range(1, 11):
                    self.assertEqual(reserve("GOV24"), (n, 10))
                for n in range(1, 4):
                    self.assertEqual(reserve("BIZINFO"), (n, 3))
                with self.assertRaises(DailyQuotaExhausted):
                    reserve("GOV24")
                with self.assertRaises(DailyQuotaExhausted):
                    reserve("BIZINFO")

    def test_more_than_100_percent_is_rejected(self):
        with patch.dict(os.environ, {
            "GOV24_APPROVED_DAILY_CALLS": "10000",
            "API_BUDGET_PERCENT": "101",
        }):
            with self.assertRaisesRegex(RuntimeError, "80 to 100"):
                quota_config("GOV24")

    def test_corrupt_ledger_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root,"api-usage.json"),"w") as fp:
                fp.write("{bad")
            with patch.dict(os.environ, {
                "STATE_DIR": root,
                "GOV24_APPROVED_DAILY_CALLS": "100",
                "API_BUDGET_PERCENT": "90",
            }):
                with self.assertRaises(RuntimeError): reserve("GOV24")

if __name__ == "__main__":
    unittest.main()
