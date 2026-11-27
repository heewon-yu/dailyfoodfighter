import tempfile
import unittest
from pathlib import Path
from snapshot import load_snapshot, reconcile, persist_snapshot


class SnapshotTests(unittest.TestCase):
    def test_initial_full_scan_has_no_archives(self):
        state = {"partial": [], "previous": [], "missing_once": [], "next_page": 1}
        state, archive = reconcile(state, ["100", "200"], complete=False)
        self.assertEqual(archive, [])
        state, archive = reconcile(state, ["300"], complete=True)
        self.assertEqual(state["previous"], ["100", "200", "300"])
        self.assertEqual(state["partial"], [])
        self.assertEqual(archive, [])

    def test_one_missing_scan_cannot_archive(self):
        state = {"partial": [], "previous": [str(i) for i in range(1, 101)],
                 "missing_once": [], "next_page": 1}
        state, archive = reconcile(state, [str(i) for i in range(2, 101)], complete=True)
        self.assertEqual(archive, [])
        self.assertEqual(state["missing_once"], ["1"])

    def test_two_completed_scans_soft_archive(self):
        old = [str(i) for i in range(1, 101)]
        state = {"partial": [], "previous": old, "missing_once": [], "next_page": 1}
        state, archive = reconcile(state, old[1:], complete=True)
        self.assertEqual(archive, [])
        state, archive = reconcile(state, old[1:], complete=True)
        self.assertEqual(archive, ["1"])

    def test_reappearance_clears_missing_candidate(self):
        old = [str(i) for i in range(1, 101)]
        state = {"partial": [], "previous": old, "missing_once": ["1"], "next_page": 1}
        state, archive = reconcile(state, old, complete=True)
        self.assertEqual(archive, [])
        self.assertEqual(state["missing_once"], [])

    def test_partial_scan_never_archives(self):
        old = [str(i) for i in range(1, 101)]
        state = {"partial": [], "previous": old, "missing_once": ["1"], "next_page": 1}
        new, archived = reconcile(state, old[1:20], complete=False)
        self.assertEqual(archived, [])
        self.assertEqual(new["previous"], old)

    def test_mass_shrink_skips_archival(self):
        old = [str(i) for i in range(1, 101)]
        state = {"partial": [], "previous": old, "missing_once": old[20:], "next_page": 1}
        state, archive = reconcile(state, old[:20], complete=True)
        self.assertEqual(archive, [])
        self.assertEqual(state["missing_once"], [])

    def test_empty_feed_never_archives(self):
        state = {"partial": [], "previous": ["1"], "missing_once": ["1"], "next_page": 1}
        updated, archived = reconcile(state, [], complete=True)
        self.assertEqual(archived, [])
        self.assertEqual(updated["missing_once"], [])

    def test_checkpoint_roundtrip_includes_cursor(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "snapshot.json"
            state = {"partial": ["1"], "previous": ["2"],
                     "missing_once": [], "next_page": 15, "per_page": 100}
            persist_snapshot(path, state)
            self.assertEqual(load_snapshot(path), state)

    def test_old_checkpoint_has_unknown_page_size(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "snapshot.json"
            path.write_text('{"partial":["1"],"previous":[],"missing_once":[],"next_page":2}', encoding="utf-8")
            state = load_snapshot(path)
            self.assertIsNone(state["per_page"])
            self.assertEqual(state["next_page"], 2)

    def test_invalid_page_size_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "snapshot.json"
            path.write_text('{"partial":[],"previous":[],"missing_once":[],"next_page":1,"per_page":1000}', encoding="utf-8")
            with self.assertRaises(ValueError):
                load_snapshot(path)

    def test_corrupt_checkpoint_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "snapshot.json"
            path.write_text('{"partial":"not-an-array"}', encoding="utf-8")
            with self.assertRaises(ValueError):
                load_snapshot(path)


if __name__ == "__main__":
    unittest.main()
