"""Official Bizinfo support-notice API adapter.

Source: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi
Requires an approved Bizinfo service key, supplied through BIZINFO_API_KEY.
Returns normalized *public program records*; never processes user profiles.
"""
from __future__ import annotations
from datetime import datetime, date
import json
import os
import re
import urllib.parse
import urllib.request
from html import unescape
from typing import Any
from quota import reserve

ENDPOINT = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
MAX_ROWS = 100
MAX_PAGES = 5  # BIZINFO_MAX_PAGES overrides this, capped at 100 per daily run.
MAX_BYTES = 3_000_000


def text(value: Any) -> str:
    if not isinstance(value, (str, int)):
        return ""
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def dates(period: str) -> tuple[str | None, str | None]:
    matches = re.findall(r"(\d{4})[-./]?(\d{2})[-./]?(\d{2})", period or "")
    parsed = []
    for year, month, day in matches[:2]:
        date = f"{year}-{month}-{day}"
        try:
            datetime.strptime(date, "%Y-%m-%d")
            parsed.append(date)
        except ValueError:
            parsed.append(None)
    if len(parsed) == 2:
        return parsed[0], parsed[1]
    if len(parsed) == 1:
        # A lone date may be publication date, not the application deadline.
        return None, None
    return None, None


def items_from_response(payload: Any) -> tuple[list[dict], int | None]:
    """Accept documented item wrapper and API variants with jsonArray as a list."""
    body = payload
    if isinstance(payload, dict) and "jsonArray" in payload:
        body = payload["jsonArray"]
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError as exc:
            raise ValueError("Bizinfo jsonArray contains non-JSON text") from exc

    total = None
    if isinstance(body, list):
        items = body
    elif isinstance(body, dict):
        if "item" in body:
            items = body["item"]
        elif "items" in body:
            items = body["items"]
        elif any(k in body for k in ("seq", "pblancId", "link", "pblancUrl")):
            items = [body]
        else:
            # Do not disguise API errors as empty or successful results.
            raise ValueError("Bizinfo response has no recognized notice list")
        raw_total = body.get("totCnt")
        if raw_total is not None:
            try:
                total = int(raw_total)
            except (TypeError, ValueError):
                total = None
    else:
        raise ValueError("Bizinfo jsonArray must be a list or object")

    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list) or any(not isinstance(x, dict) for x in items):
        raise ValueError("Bizinfo notice items must be a list of objects")
    if total is None and items and "totCnt" in items[0]:
        try:
            total = int(items[0]["totCnt"])
        except (TypeError, ValueError):
            pass
    return items, total


def official_target_types(target: str) -> list[str]:
    """Extract only explicitly named applicant categories from official target text."""
    categories = []
    if re.search(r"예비\s*창업|창업\s*예정", target):
        categories.append("PRE_STARTUP")
    if re.search(r"소상공인|자영업", target):
        categories.append("SMALL_BIZ")
    if re.search(r"중소기업|중견기업|벤처기업", target):
        categories.append("SME")
    if re.search(r"일반\s*(?:국민|시민)|개인(?!사업자)|가구|거주\s*주민", target):
        categories.append("INDIVIDUAL")
    return categories


def normalize_notice(raw: dict) -> dict:
    source_id = text(raw.get("pblancId") or raw.get("seq"))
    title = text(raw.get("pblancNm") or raw.get("title"))
    link = str(raw.get("pblancUrl") or raw.get("link") or "").strip()
    parsed = urllib.parse.urlsplit(link)
    if not source_id or not title or parsed.scheme != "https" or parsed.hostname not in ("www.bizinfo.go.kr", "bizinfo.go.kr"):
        raise ValueError("Bizinfo item lacks valid ID, title or official HTTPS link")
    start, end = dates(text(raw.get("reqstBeginEndDe") or raw.get("reqstDt") or ""))
    category = "FUND"
    today = date.today().isoformat()
    raw_period = text(raw.get("reqstBeginEndDe") or raw.get("reqstDt") or "")
    rolling = bool(re.search(r"상시|수시접수|연중\s*상시", raw_period)) and not end
    # Applicant availability must come from a dated application period or an explicit rolling notice.
    # Undated/ambiguous notices are not advertised as currently open.
    is_closed = bool(end and end < today) or bool(re.search(r"(?:접수|모집|신청)\s*(?:마감|종료|중단)", raw_period))
    # Never infer a loan, grant, eligible age, region, or income threshold from a keyword.
    hashtags = text(raw.get("hashTags") or "")
    target = text(raw.get("trgetNm") or "")
    summary = text(raw.get("bsnsSumryCn") or raw.get("description") or "")
    return {
        "source": "BIZINFO",
        "source_id": source_id,
        "category": category,
        "title": title[:500],
        "agency": text(raw.get("jrsdInsttNm") or raw.get("author"))[:200],
        "summary": summary[:5000],
        "support_amount": None,
        "amount_type": "UNKNOWN",
        "target_types": official_target_types(target),
        "region_sido": region_from_official_title(title),
        "region_sigungu": None,
        "start_date": start,
        "end_date": end,
        "application_type": "ROLLING" if rolling else ("DATED" if start and end else "UNKNOWN"),
        "apply_url": link,
        "needs_review": True,
        "status": "CLOSED" if is_closed else "UNKNOWN",
        "eligibility_json": {
            "raw_target": target[:500],
            "raw_hashtags": hashtags[:500],
            "category_original": text(raw.get("pldirSportRealmLclasCodeNm") or raw.get("lcategory"))[:100],
            "official_notice": link,
            "region_evidence": "official-title-prefix" if region_from_official_title(title) else "unknown",
        },
    }



REGIONS = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
    "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
    "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도",
    "경남": "경상남도", "제주": "제주특별자치도",
    "강원도": "강원특별자치도", "제주도": "제주특별자치도",
    "전라북도": "전북특별자치도",
}
for _long in list(REGIONS.values()):
    REGIONS[_long] = _long

def region_from_official_title(title: str) -> str | None:
    """Only an explicit single region at the beginning of the notice title."""
    match = re.match(r"^\s*\[([^\]]{1,40})\]", title)
    if not match:
        return None
    bracket = match.group(1).strip()
    if bracket in ("전국", "전체", "공통"):
        return None
    # Multiple named provinces must not be reduced to a single restriction.
    tokens = re.split(r"[\s,·/]+", bracket)
    matched = {REGIONS[t] for t in tokens if t in REGIONS}
    return next(iter(matched)) if len(matched) == 1 else None

def fetch_notices(*, start_page: int = 1, max_pages: int | None = None, progress: dict | None = None) -> list[dict]:
    key = os.environ.get("BIZINFO_API_KEY", "").strip()
    if not key:
        raise RuntimeError("BIZINFO_API_KEY missing: request service access before running")
    if not 1 <= start_page <= 100000:
        raise ValueError("invalid Bizinfo page cursor")
    if max_pages is None:
        max_pages = int(os.getenv("BIZINFO_MAX_PAGES", str(MAX_PAGES)))
    if not 1 <= max_pages <= 100:
        raise ValueError("Bizinfo page budget must be 1..100")
    output: dict[str, dict] = {}
    examined = 0
    unavailable = 0
    # Refresh page one for newly added notices, then resume older pages.
    pages = ([1] + list(range(start_page, start_page + max_pages - 1))
             if start_page > 1 and max_pages > 1 else
             list(range(start_page, start_page + max_pages)))
    for page in pages:
        query = urllib.parse.urlencode({
            "crtfcKey": key, "dataType": "json", "searchCnt": str(MAX_ROWS),
            "pageUnit": str(MAX_ROWS), "pageIndex": str(page)
        })
        request = urllib.request.Request(ENDPOINT + "?" + query, headers={"User-Agent": "PolicyBenefitMatcher/0.1"})
        reserve('BIZINFO')
        with urllib.request.urlopen(request, timeout=25) as response:
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Bizinfo response exceeds size limit")
        try:
            records, total = items_from_response(json.loads(data))
        except json.JSONDecodeError as exc:
            raise ValueError("Bizinfo returned non-JSON; verify API access and dataType") from exc
        if not records:
            if progress is not None:
                progress["next_page"] = 1
            if page == 1:
                raise ValueError("Bizinfo returned no records; verify access and response structure")
            break
        if progress is not None:
            if total is not None:
                previous_total=progress.get("reported_total")
                if previous_total is not None and previous_total != total:
                    raise ValueError("Bizinfo catalog count changed during scan; deletion blocked")
                progress["reported_total"]=total
            progress.setdefault("seen_ids", []).extend(
                text(x.get("pblancId") or x.get("seq"))
                for x in records
                if re.fullmatch(r"[A-Za-z0-9_-]{1,200}", text(x.get("pblancId") or x.get("seq")))
            )
        for item in records:
            examined += 1
            try:
                n = normalize_notice(item)
                output[n["source_id"]] = n
            except ValueError as error:
                if str(error) in ("application deadline passed", "application period not yet open"):
                    unavailable += 1
                # Do not silently fabricate incomplete items.
                continue
        completed = (total is not None and page * MAX_ROWS >= total) or len(records) < MAX_ROWS
        if progress is not None:
            progress['next_page'] = 1 if completed else page + 1
            progress['total_count'] = total
            progress['full_scan_completed'] = completed
        if completed:
            break
    if not output and examined != unavailable:
        raise ValueError("Bizinfo returned no valid normalized notices")
    # It is valid for every notice in the bounded window to be closed or future.
    # This should not trigger an endless noon retry or invent open notices.
    return list(output.values())
