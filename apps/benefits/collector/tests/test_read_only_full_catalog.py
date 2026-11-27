import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from read_only_full_catalog import scan, verify

def govrow(name):
    return {"서비스ID":name,"서비스명":"가상 서비스"}

class ReadOnlyCatalogTests(unittest.TestCase):
    def test_gov24_resumes_and_reports_complete(self):
        with TemporaryDirectory() as tmp, patch.dict(os.environ,{"STATE_DIR":tmp}), \
             patch("read_only_full_catalog.request_data") as request:
            request.side_effect=[([govrow(str(i)) for i in range(100)],150),
                                 ([govrow(str(i)) for i in range(100,150)],150)]
            scan("gov24",1)
            self.assertFalse(verify("gov24")["source_complete"])
            self.assertEqual(scan("gov24",1)["next_page"],3)
            self.assertTrue(verify("gov24")["source_complete"])
            self.assertEqual(request.call_count,2)
            self.assertEqual([c.kwargs["page"] for c in request.call_args_list],[1,2])
            self.assertEqual([p.name for p in (Path(tmp)/"read-only-catalog"/"gov24").glob("page-*.json")],
                             ["page-000001.json","page-000002.json"])
    def test_no_mutation_of_scheduler_snapshot(self):
        with TemporaryDirectory() as tmp,patch.dict(os.environ,{"STATE_DIR":tmp}), \
             patch("read_only_full_catalog.bizinfo_page",return_value=([{"pblancId":"X"}],1)):
            scheduler=Path(tmp)/"bizinfo-catalog-state.json"
            scheduler.write_text('{"next_page": 123}')
            scan("bizinfo",1)
            self.assertEqual(scheduler.read_text(),'{"next_page": 123}')
            self.assertTrue(verify("bizinfo")["source_complete"])
    def test_duplicate_ids_never_mark_complete(self):
        with TemporaryDirectory() as tmp,patch.dict(os.environ,{"STATE_DIR":tmp}), \
             patch("read_only_full_catalog.request_data",return_value=([govrow("ONE"),govrow("ONE")],2)):
            with self.assertRaisesRegex(RuntimeError,"Duplicate"):
                scan("gov24",1)
            self.assertFalse((Path(tmp)/"read-only-catalog"/"gov24"/"manifest.json").exists())
    def test_incomplete_without_official_total(self):
        with TemporaryDirectory() as tmp,patch.dict(os.environ,{"STATE_DIR":tmp}), \
             patch("read_only_full_catalog.request_data",return_value=([govrow("ONE")],None)):
            scan("gov24",1)
            self.assertFalse(verify("gov24")["source_complete"])

if __name__=="__main__":
    unittest.main()
