import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bootstrap import bootstrap


class BootstrapTests(unittest.TestCase):
    @patch.dict("os.environ", {}, clear=True)
    def test_bulk_scan_requires_explicit_quota_attestation(self):
        with self.assertRaises(RuntimeError):
            bootstrap()

    @patch.dict("os.environ", {
        "CONFIRM_GOV24_BULK_QUOTA": "YES",
        "GOV24_API_KEY": "local-fake",
        "INGEST_TOKEN": "local-fake",
        "INGEST_URL": "https://example.com/api/ingest",
    }, clear=True)
    @patch("bootstrap.run")
    @patch("bootstrap.time.sleep")
    @patch("bootstrap.load_snapshot")
    def test_full_scan_stops_after_completion(self, read_state, sleep, run):
        read_state.return_value = {"next_page": 1, "partial": [], "previous": [], "missing_once": []}
        run.return_value = {
            "fetched": 20, "changed": 20, "uploaded": 20,
            "gov24_full_scan_completed": True, "gov24_next_page": 1,
        }
        result = bootstrap()
        self.assertTrue(result["complete"])
        self.assertEqual(result["batches"], 1)
        self.assertEqual(run.call_count, 1)
        sleep.assert_not_called()

    @patch.dict("os.environ", {
        "CONFIRM_GOV24_BULK_QUOTA": "YES",
        "GOV24_API_KEY": "local-fake",
        "INGEST_TOKEN": "local-fake",
    }, clear=True)
    @patch("bootstrap.run")
    @patch("bootstrap.time.sleep")
    @patch("bootstrap.load_snapshot")
    def test_cursor_nonadvance_stops_scan(self, read_state, sleep, run):
        read_state.return_value = {"next_page": 4, "partial": [], "previous": [], "missing_once": []}
        run.return_value = {
            "fetched": 100, "changed": 100, "uploaded": 100,
            "gov24_full_scan_completed": False, "gov24_next_page": 4,
        }
        with self.assertRaises(RuntimeError):
            bootstrap()
        self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()
