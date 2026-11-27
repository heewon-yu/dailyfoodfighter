import io
import json
import unittest
from unittest.mock import patch
from pipeline import changed_records, normalize, enrich_pending_gov24


class ChangeDetectionTests(unittest.TestCase):
    def setUp(self):
        self.items = [
            normalize({"source": "BIZINFO", "source_id": "a", "category": "FUND", "title": "A", "apply_url": "https://www.bizinfo.go.kr/a"}),
            normalize({"source": "GOV24", "source_id": "b", "category": "WELFARE", "title": "B", "apply_url": "https://www.gov.kr/b"}),
        ]

    @patch("pipeline.urllib.request.urlopen")
    def test_only_changed_items_are_selected(self, urlopen):
        # Backend reports only one content hash as changed.
        class Response(io.BytesIO):
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.close()
        urlopen.return_value = Response(json.dumps({"changed": [{"source": "GOV24", "source_id": "b"}]}).encode())
        changed = changed_records(self.items, "https://worker.example/api/ingest", "secret")
        self.assertEqual([x["source_id"] for x in changed], ["b"])
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/api/ingest/check"))
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("User-agent"), "PolicyBenefitMatcher-Collector/1.0")
        sent = json.loads(request.data)
        self.assertEqual(len(sent), 2)
        self.assertEqual(sorted(sent[0]), ["content_hash", "source", "source_id"])

    @patch("pipeline.urllib.request.urlopen")
    def test_invalid_backend_change_id_fails_closed(self, urlopen):
        class Response(io.BytesIO):
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.close()
        urlopen.return_value = Response(json.dumps({"changed": [{"source": "BOGUS", "source_id": "x"}]}).encode())
        with self.assertRaises(ValueError):
            changed_records(self.items, "https://worker.example/api/ingest", "secret")

    @patch("pipeline.urllib.request.urlopen")
    def test_missing_changed_list_fails_closed(self, urlopen):
        class Response(io.BytesIO):
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.close()
        urlopen.return_value = Response(b'{"error":"unavailable"}')
        with self.assertRaises(ValueError):
            changed_records(self.items, "https://worker.example/api/ingest", "secret")

    @patch("gov24.request_data")
    @patch("pipeline.urllib.request.urlopen")
    def test_gov24_detail_backfill_keeps_list_fingerprint(self, urlopen, request_data):
        # Avoid real API/D1 operations: the legacy implementation generated
        # a new detail hash and caused a needless upload in the next scan.
        import os
        import tempfile
        listing_hash = "a" * 64
        pending = {
            "items": [{
                "source_id": "WLF000001", "title": "부모급여 지원",
                "agency": "공공기관", "summary": "지원 안내",
                "apply_url": "https://www.gov.kr/example",
                "content_hash": listing_hash,
            }]
        }
        detail = {
            "서비스ID": "WLF000001", "서비스명": "부모급여 지원",
            "지원내용": "0~23개월 지원", "신청기한": "상시",
            "온라인신청사이트URL": "https://www.gov.kr/example"
        }
        captured = []
        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self,*args): self.close()
        def fake_urlopen(req, timeout=None):
            if req.get_method() == "GET":
                return Response(json.dumps(pending).encode())
            body = json.loads(req.data)
            captured.extend(body)
            return Response(b'{"imported":1}')
        urlopen.side_effect = fake_urlopen
        request_data.side_effect = lambda kind, **kwargs: (
            ([detail], 1) if kind == "detail" else ([], 0))
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {
                "GOV24_BACKFILL_ENABLED": "YES",
                "GOV24_DETAIL_LIMIT": "1",
                "STATE_DIR": directory,
            }):
                enriched = enrich_pending_gov24("https://worker.example/api/ingest", "local-test-token")
        self.assertEqual(enriched, 1)
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0]["content_hash"], listing_hash)
        self.assertTrue(captured[0]["eligibility_json"]["details_enriched"])
        self.assertEqual(request_data.call_count, 2)


if __name__ == "__main__":
    unittest.main()

class ManualCaptureTests(unittest.TestCase):
    def test_reuse_requires_source_identity_endpoint_and_freshness(self):
        import tempfile
        from pathlib import Path
        from pipeline import read_current_gov24_capture
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)
            path=state/"read-only-catalog"/"gov24"/"details"/"A1"/"detail.json"
            path.parent.mkdir(parents=True)
            rows=[{"서비스ID":"A1","지원대상":"신청자"}]
            path.write_text(json.dumps({"source_id":"A1","endpoint":"detail",
                "retrieved_at":"2026-11-20T04:00:00+00:00","rows":rows}),encoding="utf8")
            self.assertEqual(read_current_gov24_capture(state,"A1","detail","20261120123000"),rows)
            self.assertIsNone(read_current_gov24_capture(state,"A1","detail","20261120133000"))
            self.assertIsNone(read_current_gov24_capture(state,"A1","detail",None))
            self.assertIsNone(read_current_gov24_capture(state,"A1","conditions","20261120123000"))
