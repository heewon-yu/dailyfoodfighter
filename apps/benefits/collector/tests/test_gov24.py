import unittest
from unittest.mock import patch
from gov24 import parse_response, normalize_service, fetch_services, request_data, parse_age


ROW = {
    "서비스ID": "WLF000001", "서비스명": "가상 육아지원",
    "서비스목적요약": "출산 및 육아 지원", "소관기관명": "가상 지자체",
    "상세조회URL": "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/WLF000001",
    "서비스분야": "보육",
}
DETAIL = {
    "서비스ID": "WLF000001", "서비스명": "가상 육아지원",
    "지원내용": "공식 세부 지원 안내", "지원대상": "자녀가 있는 가구",
    "선정기준": "시군구별 자세한 기준 확인", "신청기한": "상시",
    "온라인신청사이트URL": "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/WLF000001",
}
FLAGS = {
    "서비스ID": "WLF000001", "JA0110": 19, "JA0111": 34,
    "JA0204": "Y", "JA0303": "Y",
}


class Gov24Tests(unittest.TestCase):
    def test_documented_odcloud_wrapper(self):
        items, count = parse_response({"data": [ROW], "matchCount": 1200})
        self.assertEqual(count, 1200)
        self.assertEqual(items[0]["서비스ID"], "WLF000001")

    def test_reject_error_json(self):
        with self.assertRaises(ValueError):
            parse_response({"error": "invalid key", "code": 401})

    def test_normalize_three_api_join(self):
        record = normalize_service(ROW, DETAIL, FLAGS)
        self.assertEqual(record["source"], "GOV24")
        self.assertEqual(record["category"], "WELFARE")
        self.assertEqual(record["min_age"], 19)
        self.assertEqual(record["max_age"], 34)
        self.assertIsNone(record["income_limit_percent"])
        self.assertTrue(record["eligibility_json"]["region_unverified"])
        self.assertEqual(record["eligibility_json"]["condition_flags"]["JA0204"], "Y")

    def test_rolling_application_from_official_deadline(self):
        p=normalize_service(ROW,DETAIL,FLAGS)
        self.assertEqual(p["application_type"],"ROLLING")

    def test_closed_rolling_window_is_not_falsely_open(self):
        p=normalize_service(ROW,{**DETAIL,"신청기한":"상시접수 종료"},FLAGS)
        self.assertEqual(p["application_type"],"UNKNOWN")

    def test_unknown_application_window_is_not_falsely_open(self):
        p=normalize_service(ROW,{**DETAIL,"신청기한":"기관 문의"},FLAGS)
        self.assertEqual(p["application_type"],"UNKNOWN")

    def test_explicit_dated_application_window(self):
        detail={**DETAIL,"신청기한":"2026.11.01 ~ 2026.12.31"}
        p=normalize_service(ROW,detail,{})
        self.assertEqual(p["start_date"],"2026-11-01")
        self.assertEqual(p["end_date"],"2026-12-31")
        self.assertEqual(p["application_type"],"DATED")

    def test_no_fabricated_link(self):
        with self.assertRaises(ValueError):
            normalize_service({**ROW, "상세조회URL": "not a URL"}, {}, {})

    def test_untrusted_service_id(self):
        with self.assertRaises(ValueError):
            normalize_service({**ROW, "서비스ID": "../bad"}, DETAIL, FLAGS)

    def test_age_bounds(self):
        self.assertIsNone(parse_age("999"))
        self.assertIsNone(parse_age("bad"))

    @patch("gov24.request_data")
    def test_list_detail_and_conditions_join(self, request):
        def fake_call(kind, **kwargs):
            if kind == "list":
                return [ROW], 1
            return ([DETAIL], 1) if kind == "detail" else ([FLAGS], 1)
        request.side_effect = fake_call
        records = fetch_services(max_pages=1, per_page=5, detail_limit=1)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["min_age"], 19)
        self.assertEqual(request.call_count, 3)

    @patch("gov24.request_data")
    def test_page_cursor_advances_after_full_page(self, request):
        request.return_value = ([ROW], 100)
        progress = {}
        records = fetch_services(max_pages=1, per_page=1, detail_limit=0,
                                 start_page=4, progress=progress)
        self.assertEqual(len(records), 1)
        self.assertEqual(progress["next_page"], 5)
        self.assertEqual(request.call_args.kwargs["page"], 4)

    @patch("gov24.request_data")
    def test_page_cursor_rolls_over_at_last_page(self, request):
        request.return_value = ([ROW], 11)
        progress = {}
        fetch_services(max_pages=1, per_page=5, detail_limit=0,
                       start_page=3, progress=progress)
        self.assertEqual(progress["next_page"], 1)

    @patch("gov24.request_data")
    def test_snapshot_tracks_list_id_even_when_url_is_invalid(self, request):
        row={**ROW, "상세조회URL": "invalid"}
        request.return_value = ([row], 1)
        progress={}
        records=fetch_services(max_pages=1, per_page=5, detail_limit=0, progress=progress)
        self.assertEqual(records, [])
        self.assertEqual(progress["seen_ids"], ["WLF000001"])
        self.assertEqual(progress["skipped_missing_official_link"], 1)
        self.assertEqual(progress["skipped_other"], 0)

    @patch("gov24.request_data")
    def test_no_details_under_zero_budget(self, request):
        request.return_value = ([ROW], 1)
        records = fetch_services(max_pages=1, per_page=5, detail_limit=0)
        self.assertEqual(len(records), 1)
        self.assertIsNone(records[0]["min_age"])
        self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()

class Gov24IncrementalTests(unittest.TestCase):
    def test_registration_and_modified_windows_are_combined_once(self):
        from gov24 import fetch_changed_services
        since = '2026-11-19'

        def row(source_id, day):
            return {'서비스ID':source_id, '서비스명':'공식 공고',
                    '상세조회URL':'https://gov.kr/service', '등록일시':day.replace('-','')+'000000', '수정일시':day.replace('-','')+'000000'}

        with patch('gov24.request_data', side_effect=[
            ([row('new', since)],1), ([row('new',since),row('changed',since)],2)
        ]) as fetch:
            self.assertEqual({p['source_id'] for p in fetch_changed_services(since)}, {'new','changed'})
            self.assertEqual([x.kwargs['changed_filter'] for x in fetch.call_args_list],
                             [('등록일시',since),('수정일시',since)])

    def test_ignored_filter_does_not_silently_mark_success(self):
        from gov24 import fetch_changed_services
        with patch('gov24.request_data',return_value=([{'서비스ID':'old',
                                                      '등록일시':'2026-01-01'}],1)):
            with self.assertRaisesRegex(ValueError,'could not be verified'):
                fetch_changed_services('2026-11-19')
