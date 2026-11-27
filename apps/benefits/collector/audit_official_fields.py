"""Offline inventory of Bizinfo fields and Gov24 detail/condition coverage."""
from __future__ import annotations
from collections import Counter
import json
import os
from pathlib import Path
from read_only_full_catalog import save_json

def report(root):
    data = {}
    for source in ("gov24", "bizinfo"):
        path = root / source
        manifest = json.loads((path / "manifest.json").read_text(encoding="utf-8"))
        keys = Counter()
        nonempty = Counter()
        samples = {}
        ids = set()
        rows = 0
        for page in sorted(path.glob("page-*.json")):
            for row in json.loads(page.read_text(encoding="utf-8"))["rows"]:
                rows += 1
                for field, value in row.items():
                    keys[field] += 1
                    if value not in (None, "", [], {}):
                        nonempty[field] += 1
                        if field not in samples:
                            # Field types only. Never leak source PII/keys to logs.
                            samples[field] = type(value).__name__
                id_field = "서비스ID" if source == "gov24" else "pblancId"
                sid = str(row.get(id_field) or row.get("seq") or "").strip()
                ids.add(sid)
        data[source] = {
            "rows": rows,
            "source_reported_total": manifest.get("reported_total"),
            "unique_ids": len(ids), "complete_list": bool(manifest.get("complete")),
            "fields": [
                {"field": key, "present": keys[key], "nonempty": nonempty[key],
                 "type": samples.get(key, "null")}
                for key in sorted(keys)
            ]
        }
    save_json(root / "available-fields-report.json", data)
    print(json.dumps({
        source: {"rows": value["rows"], "unique_ids": value["unique_ids"],
                 "field_count": len(value["fields"]),
                 "fields": [f["field"] for f in value["fields"]]}
        for source, value in data.items()
    }, ensure_ascii=False))
    return data

if __name__ == "__main__":
    report(Path(os.getenv("STATE_DIR","/state")) / "read-only-catalog")
