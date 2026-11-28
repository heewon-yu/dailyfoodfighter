#!/usr/bin/env python3
"""사이트맵 전수 점검 — 빌드 결과(_site)의 공개 페이지가 하나도 빠짐없이 sitemap.xml에 있는지 확인한다.

사용법:
    jekyll build
    python3 scripts/check_sitemap_coverage.py _site

검사 내용
  1) _site 안에서 robots 메타가 index(이고 noindex가 아닌) HTML 페이지를 모두 모은다.
  2) 그중 sitemap.xml에 없는 URL이 하나라도 있으면 실패한다.
  3) 반대로 sitemap.xml에 있으나 _site에 실체가 없는 URL도 실패로 본다(404 색인 방지).
  4) URL 중복·비ASCII(미인코딩)도 실패로 본다.

새 페이지를 추가했는데 sitemap.xml에서 빠지면 이 검사가 CI에서 멈춘다.
sitemap.xml은 site.pages / site.static_files / site.posts를 자동 순회하므로
보통은 파일만 추가하면 통과하고, 아래 SKIP 규칙에 걸리는 페이지만 예외로 손봐야 한다.
"""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ORIGIN = "https://dailyfoodfighter.com"

# 사이트맵에 넣지 않는 산출물: 오류 페이지·검색엔진/웹마스터 소유확인 파일·내부 문서·앱 소스
SKIP_PREFIXES = (
    "assets/",
    "apps/",
    "docs/",
    "scalping-king-android/",
    "_",
)
SKIP_FILES = {"404.html"}
VERIFICATION_FILE = re.compile(r"^(google|naver)[0-9a-f]{8,}\.html$")


class RobotsParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.robots: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {key.lower(): (value or "") for key, value in attrs}
        if tag.lower() == "meta" and attributes.get("name", "").lower() == "robots":
            if self.robots is None:
                self.robots = attributes.get("content", "")


def page_url(rel: str) -> str:
    if rel.endswith("index.html"):
        rel = rel[: -len("index.html")]
    return "/" + rel


def is_indexable(path: Path) -> bool:
    """robots 메타가 없으면 크롤러는 색인하므로 공개 페이지로 본다(noindex만 제외)."""
    parser = RobotsParser()
    try:
        parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return False
    if parser.robots is None:
        return True
    robots = parser.robots.replace(" ", "").lower()
    return "noindex" not in robots


def collect_public_pages(site_dir: Path) -> dict[str, str]:
    pages: dict[str, str] = {}
    for path in sorted(site_dir.rglob("*.html")):
        rel = path.relative_to(site_dir).as_posix()
        if rel in SKIP_FILES or VERIFICATION_FILE.match(rel):
            continue
        if rel.startswith(SKIP_PREFIXES):
            continue
        if is_indexable(path):
            pages[page_url(rel)] = rel
    return pages


def sitemap_urls(sitemap: Path) -> list[str]:
    root = ET.parse(sitemap).getroot()
    return [loc.text for loc in root.findall("./{*}url/{*}loc") if loc.text]


def main(argv: list[str]) -> int:
    site_dir = Path(argv[1] if len(argv) > 1 else "_site")
    sitemap = site_dir / "sitemap.xml"
    if not sitemap.exists():
        print(f"FAIL: {sitemap} 없음 — jekyll build 결과를 먼저 확인하세요.")
        return 1

    locs = sitemap_urls(sitemap)
    listed = {
        loc[len(ORIGIN) :] if loc.startswith(ORIGIN) else loc
        for loc in locs
    }
    public = collect_public_pages(site_dir)

    missing = sorted(set(public) - listed)
    extra = sorted(listed - set(public))
    duplicates = sorted({loc for loc in locs if locs.count(loc) > 1})
    non_ascii = [loc for loc in locs if not loc.isascii()]

    print(f"공개 페이지 {len(public)}개 / 사이트맵 URL {len(locs)}개")
    problems = 0
    if missing:
        problems += len(missing)
        print(f"\nFAIL: 사이트맵에 없는 공개 페이지 {len(missing)}개")
        for url in missing:
            print(f"  - {url}   ({public[url]})")
    if extra:
        problems += len(extra)
        print(f"\nFAIL: 사이트맵에만 있고 _site에 없는 URL {len(extra)}개")
        for url in extra:
            print(f"  - {url}")
    if duplicates:
        problems += len(duplicates)
        print(f"\nFAIL: 중복 URL {len(duplicates)}개")
        for url in duplicates:
            print(f"  - {url}")
    if non_ascii:
        problems += len(non_ascii)
        print(f"\nFAIL: 비ASCII(미인코딩) URL {len(non_ascii)}개")
        for url in non_ascii:
            print(f"  - {url}")

    if problems:
        return 1
    print("OK: 공개 페이지가 모두 사이트맵에 들어 있습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
