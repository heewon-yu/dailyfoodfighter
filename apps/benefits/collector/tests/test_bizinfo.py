import unittest
from datetime import date, timedelta
from bizinfo import dates, items_from_response, normalize_notice, region_from_official_title, official_target_types


class BizinfoTests(unittest.TestCase):
    def test_official_applicant_target_types(self):
        self.assertEqual(official_target_types("소상공인 및 예비창업자"), ["PRE_STARTUP","SMALL_BIZ"])
        self.assertEqual(official_target_types("중소기업"), ["SME"])
        self.assertEqual(official_target_types("일반 국민도 가능"), ["INDIVIDUAL"])

    def test_explicit_title_region(self):
        self.assertEqual(region_from_official_title("[제주] 소상공인 지원"), "제주특별자치도")
        self.assertEqual(region_from_official_title("[경북] 제조기업"), "경상북도")
        self.assertIsNone(region_from_official_title("인천공항 내 면세점 운영"))
        self.assertIsNone(region_from_official_title("[경북·경남] 공동 사업"))

    def test_parse_dates(self):
        self.assertEqual(dates("20261101 ~ 20261220"), ("2026-11-01", "2026-12-20"))
        self.assertEqual(dates("2026-11-01 ~ 2026-12-20"), ("2026-11-01", "2026-12-20"))
        self.assertEqual(dates("기간 미정"), (None, None))
        self.assertEqual(dates("20261399"), (None, None))

    def test_parse_documented_json_shape(self):
        payload = {"jsonArray": {"item": [
            {
                "pblancId": "PBLN_001", "pblancNm": "테스트용 가상 공고",
                "pblancUrl": "https://www.bizinfo.go.kr/web/view.do?pblancId=PBLN_001",
                "jrsdInsttNm": "가상기관",
                "bsnsSumryCn": "<div>테스트 설명</div>",
                "reqstBeginEndDe": (date.today()-timedelta(days=5)).strftime("%Y%m%d") + " ~ " + (date.today()+timedelta(days=30)).strftime("%Y%m%d"),
                "trgetNm": "중소기업", "hashTags": "서울,금융",
            }
        ], "totCnt": "1"}}
        items, total = items_from_response(payload)
        self.assertEqual(total, 1)
        normalized = normalize_notice(items[0])
        self.assertEqual(normalized["source_id"], "PBLN_001")
        self.assertEqual(normalized["end_date"], (date.today()+timedelta(days=30)).isoformat())
        self.assertEqual(normalized["summary"], "테스트 설명")
        self.assertTrue(normalized["needs_review"])
        self.assertIsNone(normalized["region_sido"])
        self.assertEqual(normalized["amount_type"], "UNKNOWN")
        self.assertEqual(normalized["eligibility_json"]["raw_target"], "중소기업")

    def test_json_array_as_list(self):
        payload = {"jsonArray": [{
            "seq": "PBLN_002",
            "title": "가상 기업마당 지원 공고",
            "link": "https://www.bizinfo.go.kr/web/lay1/view.do?pblancId=PBLN_002",
            "author": "가상 기관",
            "description": "테스트 설명",
            "reqstDt": (date.today()-timedelta(days=5)).strftime("%Y%m%d") + " ~ " + (date.today()+timedelta(days=30)).strftime("%Y%m%d"),
        }]}
        items, total = items_from_response(payload)
        self.assertIsNone(total)
        self.assertEqual(len(items), 1)
        normalized = normalize_notice(items[0])
        self.assertEqual(normalized["source_id"], "PBLN_002")
        self.assertEqual(normalized["start_date"], (date.today()-timedelta(days=5)).isoformat())
        self.assertEqual(normalized["end_date"], (date.today()+timedelta(days=30)).isoformat())

    def test_json_array_as_json_string(self):
        items, total = items_from_response({"jsonArray": '[{"seq":"PBLN_003","title":"테스트","link":"https://www.bizinfo.go.kr/"}]'})
        self.assertEqual(items[0]["seq"], "PBLN_003")
        self.assertIsNone(total)

    def test_reject_error_payload(self):
        with self.assertRaises(ValueError):
            items_from_response({"jsonArray": {"error": "invalid key"}})

    def test_reject_external_link(self):
        with self.assertRaises(ValueError):
            normalize_notice({
                "pblancId": "1", "pblancNm": "Fake",
                "pblancUrl": "https://not-bizinfo.example/attack",
            })

    def test_expired_application_not_ingested(self):
        yesterday=(date.today()-timedelta(days=1)).strftime("%Y%m%d")
        earlier=(date.today()-timedelta(days=10)).strftime("%Y%m%d")
        expired = normalize_notice({
            "pblancId":"PBLN_EXPIRED","pblancNm":"마감 공고",
            "pblancUrl":"https://www.bizinfo.go.kr/view",
            "reqstBeginEndDe": earlier+" ~ "+yesterday,
        })
        self.assertEqual(expired["status"], "CLOSED")

    def test_future_application_retains_verified_dates(self):
        future=(date.today()+timedelta(days=20)).strftime("%Y%m%d")
        later=(date.today()+timedelta(days=40)).strftime("%Y%m%d")
        future_notice=normalize_notice({
            "pblancId":"PBLN_FUTURE","pblancNm":"아직 접수 전",
            "pblancUrl":"https://www.bizinfo.go.kr/view",
            "reqstBeginEndDe": future+" ~ "+later,
        })
        self.assertEqual(future_notice["status"],"UNKNOWN")
        self.assertEqual(future_notice["application_type"],"DATED")

    def test_explicit_rolling_application(self):
        p=normalize_notice({
            "pblancId":"PBLN_ROLLING","pblancNm":"상시 접수 지원",
            "pblancUrl":"https://www.bizinfo.go.kr/view",
            "reqstBeginEndDe":"상시접수",
        })
        self.assertEqual(p["application_type"],"ROLLING")

    def test_reject_wrong_response(self):
        with self.assertRaises(ValueError):
            items_from_response({"jsonArray": {"item": "not-an-array"}})


if __name__ == "__main__":
    unittest.main()
