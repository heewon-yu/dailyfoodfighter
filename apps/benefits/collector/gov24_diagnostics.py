"""Gov24 read-only shape check: print only public field names and counts.

Does not print secrets, raw server errors, or any user information.
"""
import json
import sys
from gov24 import request_data, fetch_services


def main():
    rows, total = request_data("list", per_page=3)
    print("Gov24 list records:", len(rows), "reported total:", total)
    if not rows:
        print("No services in response; check authorization or API usage")
        return
    print("First list row fields:", ", ".join(sorted(rows[0].keys())))
    sid = str(rows[0].get("서비스ID", "")).strip()
    if not sid:
        raise RuntimeError("Missing 서비스ID in list response")
    detail, _ = request_data("detail", service_id=sid, per_page=3)
    conditions, _ = request_data("conditions", service_id=sid, per_page=3)
    print("Detail rows:", len(detail), "condition rows:", len(conditions))
    if detail:
        print("Detail fields:", ", ".join(sorted(detail[0].keys())))
    if conditions:
        print("Condition fields:", ", ".join(sorted(conditions[0].keys())))
    records = fetch_services(max_pages=1, per_page=3, detail_limit=1)
    print("Normalized safe records:", len(records))
    for item in records[:3]:
        print(item["source_id"], item["title"])
    if not records:
        raise RuntimeError("No valid official HTTPS links or service IDs; inspect field structure")
    print("PASS: Gov24 adapter read-only connectivity and normalization")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never surface URLs; serviceKey may be embedded in them.
        print("FAIL:", type(error).__name__, str(error).split("?serviceKey=")[0][:250])
        sys.exit(1)
