"""Read-only Government24 public-benefits adapter (data.go.kr / odcloud).

Official Swagger: https://infuser.odcloud.kr/api/stages/44436/api-docs?1684891964110

A credential is required. API responses contain PUBLIC program information only.
The adapter never sends user profiles, and does not upload records to D1.
Run `python gov24.py` for a small, safe connectivity sample.
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from html import unescape
from typing import Any
from quota import reserve

BASE_URL = "https://api.odcloud.kr/api/gov24/v3"
ENDPOINTS = {
    "list": "serviceList",
    "detail": "serviceDetail",
    "conditions": "supportConditions",
}
MAX_RESPONSE_BYTES = 3_000_000


def clean(value: Any, limit: int = 5000) -> str:
    if value is None:
        return ""
    if not isinstance(value, (str, int, float)):
        return ""
    plain = re.sub(r"<[^>]*>", " ", str(value))
    return re.sub(r"\s+", " ", unescape(plain)).strip()[:limit]


def _service_key() -> str:
    key = os.environ.get("GOV24_API_KEY", "").strip()
    if not key:
        raise RuntimeError("GOV24_API_KEY missing; set it locally, never commit it")
    return key


def parse_response(payload: Any) -> tuple[list[dict], int | None]:
    """Odcloud returns a data array and totalCount/matchCount; reject error JSON."""
    if not isinstance(payload, dict):
        raise ValueError("Gov24 response must be JSON object")
    data = payload.get("data")
    if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
        raise ValueError("Gov24 response missing valid data list (check credentials/API error)")
    total = payload.get("matchCount", payload.get("totalCount"))
    try:
        count = int(total) if total is not None else None
    except (ValueError, TypeError):
        count = None
    return data, count


def request_data(kind: str, *, page: int = 1, per_page: int = 10,
                 service_id: str | None = None,
                 changed_filter: tuple[str, str] | None = None) -> tuple[list[dict], int | None]:
    if kind not in ENDPOINTS or not 1 <= page <= 100000 or not 1 <= per_page <= 100:
        raise ValueError("Invalid endpoint or paging parameters")
    if kind != "list" and not service_id:
        raise ValueError("service_id is required for detail/conditions")
    params: dict[str, str | int] = {
        "page": page, "perPage": per_page, "returnType": "JSON",
        "serviceKey": _service_key(),
    }
    if service_id:
        params["cond[서비스ID::EQ]"] = service_id
    if changed_filter:
        field, since = changed_filter
        if kind != "list" or field not in ("등록일시", "수정일시") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", since):
            raise ValueError("Invalid Gov24 change filter")
        params[f"cond[{field}::GTE]"] = since.replace("-", "") + "000000"
    url = BASE_URL + "/" + ENDPOINTS[kind] + "?" + urllib.parse.urlencode(params)
    # Do not print the request URL: it contains the secret.
    req = urllib.request.Request(url, headers={"User-Agent": "PolicyBenefitMatcher/0.1"})
    reserve('GOV24')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except Exception as exc:
        # urllib HTTPError can include secret-bearing URLs in exception text.
        raise RuntimeError("Gov24 request failed (check API activation, key and network)") from None
    if len(body) > MAX_RESPONSE_BYTES:
        raise ValueError("Gov24 response too large")
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError("Gov24 returned non-JSON response") from None
    return parse_response(payload)


def official_link(list_row: dict, detail: dict) -> str:
    for candidate in (detail.get("온라인신청사이트URL"), list_row.get("상세조회URL")):
        link = clean(candidate, 2000)
        try:
            parts = urllib.parse.urlsplit(link)
            if parts.scheme == "https" and parts.hostname and not parts.username and not parts.password:
                return link
        except ValueError:
            continue
    # Avoid inventing a service URL; records without a valid official link fail closed.
    return ""


def parse_age(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        return None
    return parsed if 0 <= parsed <= 120 else None


def normalize_service(list_row: dict, detail: dict | None = None,
                      conditions: dict | None = None) -> dict:
    detail = detail or {}
    conditions = conditions or {}
    service_id = clean(list_row.get("서비스ID"), 200)
    title = clean(detail.get("서비스명") or list_row.get("서비스명"), 500)
    if not service_id or not title:
        raise ValueError("Missing Gov24 service ID or title")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", service_id):
        raise ValueError("Unsafe Gov24 service ID")
    link = official_link(list_row, detail)
    if not link:
        raise ValueError("Missing HTTPS official service link")
    summary = clean(detail.get("지원내용") or list_row.get("지원내용")
                    or list_row.get("서비스목적요약"))
    min_age = parse_age(conditions.get("JA0110"))
    max_age = parse_age(conditions.get("JA0111"))
    if min_age is not None and max_age is not None and min_age > max_age:
        min_age = max_age = None
    deadline = clean(detail.get("신청기한") or list_row.get("신청기한"), 300)
    # Only exact, explicit application-window signals can mark a service open.
    # Open-ended language in selection criteria must not be treated as a deadline.
    rolling = (bool(re.search(r"상시\s*(?:신청|접수)?|연중\s*(?:상시|신청|접수)", deadline))
               and not bool(re.search(r"마감|종료|중단|접수\s*불가|예산\s*소진", deadline)))
    explicitly_closed = bool(re.search(r"(?:접수|신청|모집)\s*(?:마감|종료|중단)|(?:마감|종료)\s*완료", deadline))
    date_tokens = re.findall(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})", deadline)
    dates_found = []
    from datetime import date
    for y, m, d in date_tokens[:2]:
        try:
            dates_found.append(date(int(y), int(m), int(d)).isoformat())
        except ValueError:
            dates_found = []
            break
    start_date, end_date = (dates_found[0], dates_found[1]) if len(dates_found) == 2 else (None, None)
    application_type = "DATED" if start_date and end_date else ("ROLLING" if rolling else "UNKNOWN")
    raw_flags = {key: clean(value, 100)
                 for key, value in conditions.items()
                 if key.startswith("JA") and clean(value, 100)}
    return {
        "source": "GOV24",
        "source_id": service_id,
        "category": "WELFARE",
        "title": title,
        "agency": clean(detail.get("소관기관명") or list_row.get("소관기관명"), 200),
        "summary": summary,
        "support_amount": None,
        "amount_type": "UNKNOWN",
        "target_types": [],
        "region_sido": None,
        "region_sigungu": None,
        "min_age": min_age,
        "max_age": max_age,
        "income_limit_percent": None,  # JA020x are BANDS, never a single upper limit.
        "start_date": start_date,
        "end_date": end_date,
        "application_type": application_type,
        "apply_url": link,
        "needs_review": True,
        "status": "CLOSED" if explicitly_closed else "UNKNOWN",
        "eligibility_json": {
            "details_enriched": bool(detail),
            "conditions_enriched": bool(conditions),
            "source": "gov24-official",
            "target_raw": clean(detail.get("지원대상") or list_row.get("지원대상")),
            "criteria_raw": clean(detail.get("선정기준") or list_row.get("선정기준")),
            "application_raw": clean(detail.get("신청방법") or list_row.get("신청방법")),
            "deadline_raw": clean(detail.get("신청기한") or list_row.get("신청기한")),
            "region_unverified": True,
            "condition_flags": raw_flags,
            "service_category": clean(list_row.get("서비스분야"), 200),
            "user_category": clean(list_row.get("사용자구분"), 200),
            "last_source_modified": clean(list_row.get("수정일시"), 100),
        },
    }


def fetch_services(*, max_pages: int = 1, per_page: int = 10,
                   detail_limit: int = 5, start_page: int = 1,
                   progress: dict | None = None) -> list[dict]:
    """Small bounded fetch. Detail + conditions calls are capped per run."""
    if not 1 <= max_pages <= 5 or not 1 <= per_page <= 100:
        raise ValueError("Gov24 page cap exceeded")
    if not 0 <= detail_limit <= max_pages * per_page:
        raise ValueError("Gov24 detail cap invalid")
    if not 1 <= start_page <= 100000:
        raise ValueError("Gov24 start page invalid")
    if progress is not None:
        progress["next_page"] = start_page
    result: dict[str, dict] = {}
    enriched = 0
    skipped_missing_official_link = 0
    skipped_other = 0
    for page in range(start_page, start_page + max_pages):
        listing, total = request_data("list", page=page, per_page=per_page)
        if progress is not None:
            if total is not None:
                known_total = progress.get("reported_total")
                if known_total is not None and known_total != total:
                    raise ValueError("Gov24 catalog total changed during scan; retry from a clean snapshot")
                progress["reported_total"] = total
            progress["next_page"] = (1 if not listing or len(listing) < per_page
                                     or (total is not None and page * per_page >= total)
                                     else page + 1)
        if progress is not None:
            progress.setdefault("seen_ids", []).extend(
                clean(row.get("서비스ID"), 200) for row in listing
                if re.fullmatch(r"[A-Za-z0-9_-]{1,200}", clean(row.get("서비스ID"), 200))
            )
        for row in listing:
            service_id = clean(row.get("서비스ID"), 200)
            if not service_id or service_id in result:
                continue
            detail, condition = {}, {}
            if enriched < detail_limit:
                detail_items, _ = request_data("detail", service_id=service_id)
                condition_items, _ = request_data("conditions", service_id=service_id)
                detail = next((x for x in detail_items if x.get("서비스ID") == service_id), {})
                condition = next((x for x in condition_items if x.get("서비스ID") == service_id), {})
                enriched += 1
            try:
                result[service_id] = normalize_service(row, detail, condition)
            except ValueError as exc:
                # Diagnostics only; still reject items without an official HTTPS
                # application/details URL. Never invent an application link.
                if str(exc) == "Missing HTTPS official service link":
                    skipped_missing_official_link += 1
                else:
                    skipped_other += 1
                continue
        if not listing or len(listing) < per_page or (total is not None and page * per_page >= total):
            break
    if progress is not None:
        progress["skipped_missing_official_link"] = skipped_missing_official_link
        progress["skipped_other"] = skipped_other
    return list(result.values())


def fetch_changed_services(since: str) -> list[dict]:
    """Fetch both date windows completely. A filtered list cannot prove withdrawal."""
    result = {}
    size = 100
    floor = since.replace("-", "") + "000000"
    for field in ("등록일시", "수정일시"):
        ids = set()
        expected = None
        for page in range(1, 26):
            listing, total = request_data("list", page=page, per_page=size, changed_filter=(field, since))
            if total is None or total < 0 or (expected is not None and expected != total):
                raise ValueError("Gov24 change list count missing or changed")
            expected = total
            for row in listing:
                source_id = clean(row.get("서비스ID"), 200)
                stamp = clean(row.get(field), 100)
                if (not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", source_id) or
                    not re.fullmatch(r"\d{14}", stamp) or stamp < floor or source_id in ids):
                    raise ValueError("Gov24 change filter or paging could not be verified")
                ids.add(source_id)
                try:
                    result[source_id] = normalize_service(row, {}, {})
                except ValueError:
                    continue  # Same official-link rules as the complete list.
            if len(ids) == expected:
                break
            if len(listing) != size or len(ids) > expected:
                raise ValueError("Gov24 change list incomplete")
        else:
            raise ValueError("Gov24 change list exceeded the bounded scan")
    return list(result.values())


if __name__ == "__main__":
    # Avoid printing credentials, query URLs or full response data.
    records = fetch_services(max_pages=1, per_page=5, detail_limit=1)
    print("Gov24 verified sample count:", len(records))
    for record in records[:3]:
        print(record["source_id"], record["title"], record["apply_url"])
