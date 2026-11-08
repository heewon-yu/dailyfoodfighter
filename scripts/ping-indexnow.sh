#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

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

def sitemap_urls(xml):
    root = ET.fromstring(xml)
    if root.tag.rsplit("}", 1)[-1] != "urlset":
        raise ValueError("Expected a sitemap URL set.")
    return [loc.text.strip() for loc in root.findall("./{*}url/{*}loc") if loc.text]

def main(args):
    if not args:
        raise ValueError("Usage: ping-indexnow.sh --sitemap | --sitemap-file FILE | HTTPS_URL [HTTPS_URL ...]")
    if args == ["--sitemap"]:
        args = sitemap_urls(read_url(f"{origin}/sitemap.xml"))
    elif len(args) == 2 and args[0] == "--sitemap-file":
        built_sitemap = Path(args[1])
        if built_sitemap.with_name(f"{key}.txt").read_text().strip() != key:
            raise ValueError("The built IndexNow key file does not match the submission key.")
        args = sitemap_urls(built_sitemap.read_bytes())
        print(f"Using the validated build sitemap ({len(args)} URLs).", flush=True)
    urls = list(dict.fromkeys(args))
    if not urls or len(urls) > 10000:
        raise ValueError("IndexNow requires between 1 and 10,000 URLs per request.")
    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if not url.isascii() or parsed.scheme != "https" or parsed.netloc != host or parsed.query or parsed.fragment:
            raise ValueError(f"Expected a canonical URL on {host}: {url}")

    # IndexNow checks the public key on the canonical host.
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
except urllib.error.HTTPError as error:
    url = error.geturl()
    method = "POST" if url == endpoint else "GET"
    challenge = " (Cloudflare challenge)" if error.headers.get("cf-mitigated") == "challenge" else ""
    print(f"IndexNow submission failed: {method} {url}: HTTP {error.code} {error.reason}{challenge}", file=sys.stderr)
    sys.exit(1 if 500 <= error.code < 600 else 3)
except (urllib.error.URLError, TimeoutError) as error:
    sys.exit(f"IndexNow submission failed: {error}")
except (ValueError, ET.ParseError, OSError) as error:
    print(f"IndexNow submission failed: {error}", file=sys.stderr)
    sys.exit(3)
PY
