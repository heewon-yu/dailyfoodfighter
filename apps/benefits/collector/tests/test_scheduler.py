import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from scheduler import KST, slot_at, due_day, last_success, last_success_slot, needs_collection, next_run, ready, run_collection


class SchedulerTests(unittest.TestCase):
    def when(self, day, hour):
        return dt.datetime(2026, 11, day, hour, 0, tzinfo=KST)

    def test_five_daily_slots_and_no_midnight_run(self):
        self.assertIsNone(slot_at(self.when(19,9)))
        for hour in (10,12,14,16,18):
            self.assertEqual(slot_at(self.when(19,hour)).hour,hour)
        self.assertEqual(next_run(self.when(19,9)).hour,10)
        self.assertEqual(next_run(self.when(19,10)).hour,12)
        self.assertEqual(next_run(self.when(19,18)).date(),dt.date(2026,11,20))
        self.assertEqual(next_run(self.when(19,18)).hour,10)

    def test_completed_slot_prevents_repeat_but_next_slot_runs(self):
        self.assertFalse(needs_collection(self.when(19,9),None))
        self.assertTrue(needs_collection(self.when(19,10),None))
        self.assertFalse(needs_collection(self.when(19,11),self.when(19,10)))
        self.assertTrue(needs_collection(self.when(19,12),self.when(19,10)))

    @patch.dict("os.environ", {
        "COLLECTOR_SOURCE": "gov24",
        "GOV24_DAILY_FULL_CATALOG": "NO",
    }, clear=True)
    @patch("scheduler.ready", return_value=True)
    @patch("bootstrap.bootstrap", side_effect=AssertionError(
        "Unit tests must never invoke the real Gov24 API or D1 ingest"))
    @patch("scheduler.run", return_value={"fetched": 2, "changed": 1, "uploaded": 1})
    def test_successful_recovery_then_noon(self, mocked_run, mocked_bootstrap, mocked_ready):
        # This test verifies *slot checkpoints*, not public API connectivity.
        # Production .env enables daily full scanning; without this isolation
        # the test used to trigger live Gov24 requests and write to D1.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-success-date.txt"
            with patch("scheduler.STATE_DIR", Path(directory)):
                self.assertFalse(run_collection(path, self.when(19, 9)))
                self.assertFalse(path.exists())
                self.assertTrue(run_collection(path, self.when(19, 10)))
                self.assertEqual(last_success_slot(path).hour, 10)
                self.assertFalse(run_collection(path, self.when(19, 11)))
                self.assertTrue(run_collection(path, self.when(19, 12)))
                self.assertEqual(last_success(path), dt.date(2026, 11, 19))
            self.assertEqual(mocked_run.call_count, 2)
            mocked_bootstrap.assert_not_called()

    @patch("scheduler.ready", return_value=True)
    @patch("bootstrap.bootstrap", side_effect=RuntimeError("temporary failure"))
    def test_failure_preserves_checkpoint(self, mocked_bootstrap, mocked_ready):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-success-date.txt"
            path.write_text(self.when(18,18).isoformat(), encoding="utf-8")
            with patch.dict("os.environ", {
                "COLLECTOR_SOURCE": "gov24",
                "GOV24_DAILY_FULL_CATALOG": "YES",
                "CONFIRM_GOV24_BULK_QUOTA": "YES"
            }, clear=True), patch("scheduler.STATE_DIR", Path(directory)):
                with self.assertRaisesRegex(RuntimeError, "temporary failure"):
                    run_collection(path, self.when(19, 13))
            mocked_bootstrap.assert_called_once()
            self.assertEqual(last_success(path), dt.date(2026, 11, 18))

    @patch("scheduler.ready", return_value=False)
    @patch("scheduler.run")
    def test_not_ready_never_calls_apis(self, mocked_run, mocked_ready):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-success-date.txt"
            self.assertFalse(run_collection(path, self.when(19, 13)))
            mocked_run.assert_not_called()
            self.assertFalse(path.exists())

    def test_invalid_checkpoint_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "last-success-date.txt"
            path.write_text("not-a-date", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                last_success(path)

    @patch.dict("os.environ", {
        "COLLECTOR_SOURCE": "all", "GOV24_DAILY_FULL_CATALOG": "YES",
        "CONFIRM_GOV24_BULK_QUOTA": "YES",
    }, clear=True)
    @patch("scheduler.ready", return_value=True)
    @patch("bootstrap.bootstrap", return_value={
        "complete": True, "fetched": 300, "changed": 5, "uploaded": 5,
    })
    @patch("scheduler.run", return_value={
        "fetched": 500, "changed": 2, "uploaded": 2,
    })
    def test_daily_full_scan_combines_gov24_and_bizinfo(self, run, boot, ready):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory) / "last-success-date.txt"
            with patch("scheduler.STATE_DIR", Path(directory)):
                self.assertTrue(run_collection(path, self.when(19, 13)))
            boot.assert_called_once()
            run.assert_called_once()
            self.assertEqual(last_success(path), dt.date(2026, 11, 19))

    @patch.dict("os.environ", {
        "COLLECTOR_SOURCE": "gov24", "GOV24_DAILY_FULL_CATALOG": "YES",
        "CONFIRM_GOV24_BULK_QUOTA": "YES",
    }, clear=True)
    @patch("scheduler.ready", return_value=True)
    @patch("bootstrap.bootstrap", return_value={
        "complete": False, "fetched": 500, "changed": 500, "uploaded": 500,
    })
    def test_incomplete_full_scan_is_bounded_and_resumes_next_slot(self, boot, ready):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory) / "last-success-date.txt"
            with patch("scheduler.STATE_DIR", Path(directory)):
                self.assertTrue(run_collection(path, self.when(19, 13)))
                self.assertEqual(last_success_slot(path).hour, 12)
                self.assertFalse((Path(directory) / "gov24-full-catalog-date.txt").exists())
                self.assertFalse(run_collection(path, self.when(19, 13)))
            boot.assert_called_once()

    @patch.dict("os.environ", {"COLLECTOR_SOURCE": "all",
                               "GOV24_DAILY_FULL_CATALOG": "YES",
                               "CONFIRM_GOV24_BULK_QUOTA": "YES"}, clear=True)
    @patch("scheduler.ready", return_value=True)
    @patch("bootstrap.bootstrap", side_effect=__import__("quota").DailyQuotaExhausted("GOV24"))
    @patch("scheduler.run", return_value={"fetched": 3, "changed": 1, "uploaded": 1})
    def test_gov24_budget_exhaustion_does_not_starve_bizinfo(self, run, boot, ready):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory) / "last-success-date.txt"
            with patch("scheduler.STATE_DIR", Path(directory)):
                self.assertTrue(run_collection(path, self.when(19, 14)))
            boot.assert_called_once()
            run.assert_called_once()
            self.assertEqual(last_success_slot(path).hour,14)

    @patch.dict("os.environ", {"COLLECTOR_SOURCE": "all",
                               "BIZINFO_API_KEY": "mock", "GOV24_API_KEY": "mock",
                               "INGEST_URL": "https://test.example/api/ingest",
                               "INGEST_TOKEN": "fake", "GOV24_APPROVED_DAILY_CALLS": "100", "BIZINFO_APPROVED_DAILY_CALLS": "100"}, clear=True)
    def test_all_sources_ready_with_credentials(self):
        self.assertTrue(ready())

    @patch.dict("os.environ", {"COLLECTOR_SOURCE": "all", "BIZINFO_API_KEY": "mock",
                               "INGEST_URL": "https://test.example/api/ingest",
                               "INGEST_TOKEN": "fake"}, clear=True)
    def test_missing_second_api_key_not_ready(self):
        self.assertFalse(ready())


if __name__ == "__main__":
    unittest.main()

class IncrementalSchedulerTests(unittest.TestCase):
    @patch.dict("os.environ",{
        "COLLECTOR_SOURCE":"gov24","GOV24_DAILY_FULL_CATALOG":"YES",
        "GOV24_INCREMENTAL_ENABLED":"YES"
    },clear=True)
    @patch("scheduler.ready",return_value=True)
    @patch("scheduler.run",return_value={"fetched":2,"uploaded":1,"changed":1})
    def test_between_weekly_checks_uses_overlapping_delta_window(self, run, ready):
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)
            (state/"gov24-full-catalog-date.txt").write_text("2026-11-18")
            checkpoint=state/"last-success-date.txt"
            checkpoint.write_text("2026-11-19T18:00:00+09:00")
            with patch("scheduler.STATE_DIR",state):
                self.assertTrue(run_collection(checkpoint,dt.datetime(2026,11,20,12,tzinfo=KST)))
            run.assert_called_once_with(gov24_since="2026-11-18")
