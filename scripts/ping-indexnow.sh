#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

host = "dailyfoodfighter.com"
origin = f"https://{host}"
key = "c7438e83b8a14ec1a1961efce1d2f782"
key_location = f"{origin}/{key}.txt"
endpoint = "https://api.indexnow.org/indexnow"

def read_url(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError(f"Expected HTTP 200 without redirect: {url}")
        return response.read()

def main(args):
    if not args:
        raise ValueError("Usage: ping-indexnow.sh --sitemap | HTTPS_URL [HTTPS_URL ...]")
    if args == ["--sitemap"]:
        robots = read_url(f"{origin}/robots.txt").decode()
        if "User-agent: Claude-SearchBot" not in robots:
            raise ValueError("SEO crawler settings are not deployed yet.")
        sitemap = ET.fromstring(read_url(f"{origin}/sitemap.xml"))
        args = [loc.text.strip() for loc in sitemap.findall("./{*}url/{*}loc") if loc.text]
    urls = list(dict.fromkeys(args))
    if not urls or len(urls) > 10000:
        raise ValueError("IndexNow requires between 1 and 10,000 URLs per request.")
    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != host or parsed.query or parsed.fragment:
            raise ValueError(f"Expected a canonical URL on {host}: {url}")
    if read_url(key_location).decode().strip() != key:
        raise ValueError("The live IndexNow key file does not match the submission key.")
    for url in urls:
        read_url(url)

    data = json.dumps({"host": host, "key": key, "keyLocation": key_location, "urlList": urls})
    request = urllib.request.Request(
        endpoint,
        data=data.encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status not in (200, 202):
            raise ValueError(f"Unexpected IndexNow response: HTTP {response.status}")
        result = "accepted" if response.status == 200 else "received; key verification pending"
        print(f"IndexNow HTTP {response.status}: {result} ({len(urls)} URLs). Indexing is separate.")

try:
    main(sys.argv[1:])
except (ValueError, ET.ParseError, OSError) as error:
    sys.exit(f"IndexNow submission failed: {error}")
PY
