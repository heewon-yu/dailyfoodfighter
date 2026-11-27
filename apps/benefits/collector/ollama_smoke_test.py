"""Offline-from-public-API smoke test for Ollama JSON inference.

Uses a fictional notice only; does not call government APIs or Cloudflare.
Requires the model downloaded and Ollama accessible from the container.
"""
import json
import os
import time
import urllib.error
import urllib.request

endpoint = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
model = os.environ.get("OLLAMA_MODEL") or "qwen3:4b"
notice = (
    "가상 공고 (실제 지원사업 아님): 서울특별시 거주 만 19세 이상 34세 이하 청년 대상. "
    "기준 중위소득 150% 이하 신청 가능. 신청 기간은 2026년 12월 1일부터 12월 20일까지."
)
prompt = (
    "You extract explicitly stated eligibility from Korean public notices. "
    "Return ONLY a JSON object with keys min_age, max_age, income_limit_percent, "
    "region_sido; use null for missing values, no commentary. "
    "This is a fictional TEST notice, not a real subsidy.\n" + notice
)
payload = {
    "model": model,
    "prompt": prompt,
    "stream": False,
    "format": "json",
    "options": {"temperature": 0},
}
request = urllib.request.Request(
    endpoint + "/api/generate",
    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
print("Ollama local JSON test starting; model:", model, flush=True)
started = time.monotonic()
try:
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)
    raw = result.get("response", "")
    obj = json.loads(raw)
    if not isinstance(obj, dict):
        raise ValueError("Model response must be a JSON object")
    expected = {"min_age": 19, "max_age": 34, "income_limit_percent": 150, "region_sido": "서울특별시"}
    print("Parsed:", json.dumps(obj, ensure_ascii=False, sort_keys=True))
    print("Elapsed seconds:", round(time.monotonic() - started, 1))
    wrong = {key: {"expected": value, "actual": obj.get(key)} for key, value in expected.items() if obj.get(key) != value}
    if wrong:
        print("FAIL: extraction mismatch:", json.dumps(wrong, ensure_ascii=False))
        raise SystemExit(2)
    print("PASS: local model extracted all four reference fields.")
except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
    print("FAIL:", type(exc).__name__, str(exc))
    raise SystemExit(1)
