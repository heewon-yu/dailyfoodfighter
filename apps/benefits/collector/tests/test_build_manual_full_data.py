import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from importlib.machinery import SourceFileLoader

module=SourceFileLoader(
    "build_manual_full_data",
    str(Path(__file__).resolve().parents[2] / "scripts" / "build-manual-full-data.py")
).load_module()
build=module.build

def write(path, content):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(content,ensure_ascii=False),encoding="utf-8")

class FullDataMergeTests(unittest.TestCase):
    def test_reuses_existing_raw_details_without_api_calls_and_baseline(self):
        with TemporaryDirectory() as temp:
            root=Path(temp)/"source"
            output=Path(temp)/"output"
            baseline=Path(temp)/"baseline.json"
            write(baseline,{"programs":[{"id":"GOV24:001"}]})
            write(root/"gov24"/"manifest.json",{"complete":True,"reported_total":1})
            write(root/"bizinfo"/"manifest.json",{"complete":True,"reported_total":1})
            write(root/"gov24"/"page-000001.json",{"rows":[{"서비스ID":"001","서비스명":"지원"}]})
            write(root/"bizinfo"/"page-000001.json",{"rows":[{"pblancId":"B001","pblancNm":"지원","inqireCo":"담당 문의"}]})
            write(root/"gov24"/"details"/"001"/"detail.json",{"source_id":"001","endpoint":"detail","rows":[{"서비스ID":"001","지원대상":"전국"}]})
            write(root/"gov24"/"details"/"001"/"conditions.json",{"source_id":"001","endpoint":"conditions","rows":[{"서비스ID":"001","JA0110":"20"}]})
            result=build(root,output,baseline)
            self.assertEqual(result["sources"]["gov24"]["detail_available"],1)
            self.assertEqual(result["sources"]["gov24"]["conditions_available"],1)
            self.assertEqual(result["sources"]["gov24"]["existing_in_baseline"],1)
            self.assertEqual(result["sources"]["bizinfo"]["missing_from_baseline"],1)
            self.assertEqual(json.loads((output/"bizinfo-full-original.json").read_text())[0]["listing"]["inqireCo"],"담당 문의")

    def test_reject_incomplete_source(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)/"source"
            write(root/"gov24"/"manifest.json",{"complete":False,"reported_total":1})
            with self.assertRaisesRegex(ValueError,"list not completed"):
                build(root,Path(tmp)/"output")

if __name__=="__main__":
    unittest.main()
