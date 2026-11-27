import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("d1_sql", ROOT / "scripts" / "build-d1-staging-sql.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagingTests(unittest.TestCase):
    def test_sql_escapes_quotes_and_keeps_existing_detail(self):
        program = {"source": "GOV24", "source_id": "ABC_1", "id": "GOV24:ABC_1",
                   "listing": {"서비스ID": "ABC_1", "서비스명": "청년's 자금"},
                   "detail": None, "conditions": None}
        sql = module.statement(program)
        self.assertIn("청년''s 자금", sql)
        self.assertIn("COALESCE(excluded.detail_json,official_source_snapshots.detail_json)", sql)
        self.assertIn("condition_review='PENDING'", sql)
        self.assertNotIn("DELETE FROM programs", sql)

    def test_invalid_detail_provenance_is_rejected(self):
        program = {"source": "GOV24", "source_id": "AA", "id": "GOV24:AA",
                   "listing": {"서비스ID": "AA"},
                   "detail": {"source_id": "DIFFERENT", "endpoint": "detail", "rows": [{"서비스ID": "AA"}]}}
        with self.assertRaisesRegex(ValueError, "mismatch"):
            module.statement(program)

    def test_generates_chunks_and_detects_duplicates(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            src = root / "input"
            src.mkdir()
            items = [{"source": "GOV24", "id": f"GOV24:{i}", "source_id": str(i),
                      "listing": {"서비스ID": str(i), "서비스명": "사업"}} for i in range(3)]
            (src / "gov24-full-original.json").write_text(json.dumps(items), encoding="utf8")
            (src / "bizinfo-full-original.json").write_text(json.dumps([
                {"source": "BIZINFO", "id": "BIZINFO:3", "source_id": "3",
                 "listing": {"pblancId": "3", "pblancNm": "기업"}}
            ]), encoding="utf8")
            manifest = module.generate(src, root / "out", 20000)
            self.assertEqual(manifest["records"], 4)
            self.assertTrue((root / "out" / manifest["files"][0]).exists())
            items.append(items[0])
            (src / "gov24-full-original.json").write_text(json.dumps(items), encoding="utf8")
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                module.generate(src, root / "out", 20000)


if __name__ == "__main__":
    unittest.main()

class StagingIdempotenceTests(unittest.TestCase):
    def test_capture_timestamp_change_does_not_rewrite_same_official_content(self):
        import sqlite3
        with sqlite3.connect(":memory:") as db:
            db.executescript((ROOT/"migrations/0003_official_source_snapshots.sql").read_text())
            record={"id":"GOV24:A1","source":"GOV24","source_id":"A1",
                "listing":{"서비스ID":"A1"},"detail":{"source_id":"A1","endpoint":"detail",
                    "rows":[{"서비스ID":"A1","지원대상":"공식 조건"}],"retrieved_at":"first"}}
            db.execute(module.statement(record))
            record["detail"]["retrieved_at"]="later"
            db.execute(module.statement(record))
            record["detail"]=None
            db.execute(module.statement(record))
            self.assertEqual(db.total_changes,1)
            self.assertEqual(db.execute("SELECT detail_complete FROM official_source_snapshots").fetchone(),(1,))
