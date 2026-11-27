import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline import normalize, valid_url
from scheduler import next_run


class PipelineTests(unittest.TestCase):
    def test_url_requires_https(self):
        self.assertTrue(valid_url("https://www.data.go.kr/path"))
        self.assertFalse(valid_url("http://example.com"))
        self.assertFalse(valid_url("file:///private/data"))

    def test_normalize_public_notice(self):
        item = normalize({
            "source": "TEST", "source_id": "001", "category": "FUND",
            "title": "Example", "apply_url": "https://example.org/apply"
        })
        self.assertTrue(item["needs_review"])
        self.assertEqual(len(item["content_hash"]), 64)

    def test_invalid_source(self):
        with self.assertRaises(ValueError):
            normalize({"source": "X", "source_id": "1", "category": "FUND", "title": "T", "apply_url": "http://example.org"})

    def test_five_daytime_slots_kst(self):
        now = datetime(2026, 11, 19, 10, 30, tzinfo=ZoneInfo("Asia/Seoul"))
        self.assertEqual(next_run(now).hour, 12)
        later = datetime(2026, 11, 19, 12, 1, tzinfo=ZoneInfo("Asia/Seoul"))
        self.assertEqual(next_run(later).day, 19)
        self.assertEqual(next_run(later).hour, 14)


if __name__ == "__main__":
    unittest.main()
