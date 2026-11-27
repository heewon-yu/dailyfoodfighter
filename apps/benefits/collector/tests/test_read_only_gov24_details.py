import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from read_only_full_catalog import save_json
from read_only_gov24_details import collect, listing, summary

def mkroot(tmp):
    root = Path(tmp) / "read-only-catalog" / "gov24"
    save_json(root/"manifest.json", {
        "complete":True,"paging_finished":True,"reported_total":2
    })
    save_json(root/"page-000001.json", {"rows":[
        {"서비스ID":"A01","서비스명":"서비스 A","소관기관명":"보건복지부"},
        {"서비스ID":"B01","서비스명":"서비스 B","소관기관명":"인천광역시청"}
    ]})
    return root

class ReadOnlyGov24DetailTests(unittest.TestCase):
    def test_all_detail_conditions_saved_and_resumed_without_extra_calls(self):
        with TemporaryDirectory() as tmp:
            root=mkroot(tmp)
            with patch("read_only_gov24_details.request_data",
                       side_effect=lambda kind, **kwargs: ([{"서비스ID":kwargs["service_id"],"지원대상":"공식 정보"}],1)) as req:
                a=collect(root,2)
                self.assertEqual(a["calls_this_run"],2)
                self.assertEqual(a["both_saved"],1)
                b=collect(root,2)
                self.assertEqual(b["both_saved"],2)
                c=collect(root,2)
                self.assertTrue(c["details_complete"])
                self.assertEqual(c["calls_this_run"],0)
                self.assertEqual(req.call_count,4)
            self.assertTrue((root/"details"/"A01"/"conditions.json").exists())

    def test_empty_or_wrong_id_is_not_treated_as_collected(self):
        with TemporaryDirectory() as tmp:
            root=mkroot(tmp)
            with patch("read_only_gov24_details.request_data",
                       return_value=([{"서비스ID":"DIFFERENT"}],1)) as req:
                report=collect(root,2)
                self.assertEqual(report["both_saved"],0)
                self.assertEqual(report["failures_this_run"],2)
                # Empty/mismatched official responses require explicit retry,
                # rather than being silently counted as valid.
                collect(root,2)
                self.assertEqual(req.call_count,4)

    def test_incomplete_listing_fails_closed(self):
        with TemporaryDirectory() as tmp:
            root=mkroot(tmp)
            save_json(root/"manifest.json", {"complete":False,"reported_total":2})
            with self.assertRaisesRegex(RuntimeError,"incomplete"):
                listing(root)

    def test_does_not_touch_original_list_files(self):
        with TemporaryDirectory() as tmp:
            root=mkroot(tmp)
            before=(root/"page-000001.json").read_bytes()
            with patch("read_only_gov24_details.request_data",return_value=([],0)):
                result=collect(root,2)
            self.assertEqual(result["failures_this_run"],2)
            self.assertEqual(result["both_saved"],0)
            self.assertEqual((root/"page-000001.json").read_bytes(),before)

if __name__=="__main__":
    unittest.main()
