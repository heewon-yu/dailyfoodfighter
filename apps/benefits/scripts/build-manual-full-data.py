#!/usr/bin/env python3
"""Read-only local merger of Gov24 LIST/details/conditions + Bizinfo original rows.

Does not contact API/D1 or update repository data. Records are evidence, not
verified eligibility or proof of nationwide jurisdiction.
"""
import argparse
import json
from pathlib import Path
from collections import Counter


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def build(root, output, baseline=None):
    baseline_ids = None
    if baseline:
        snapshot = read(baseline)
        baseline_ids = {
            str(p["id"]) for p in snapshot["programs"] if isinstance(p, dict) and p.get("id")
        }
    report = {"sources": {}, "baseline_available": baseline_ids is not None}
    for source, prefix in (("gov24", "GOV24:"), ("bizinfo", "BIZINFO:")):
        folder = root / source
        manifest = read(folder / "manifest.json")
        if not manifest.get("complete"):
            raise ValueError(source + " list not completed")
        records = []
        seen = set()
        counts = Counter()
        for page in sorted(folder.glob("page-*.json")):
            for item in read(page)["rows"]:
                sid = str(item.get("서비스ID") if source == "gov24" else
                          item.get("pblancId") or item.get("seq") or "").strip()
                if not sid or sid in seen:
                    raise ValueError(source + " empty/duplicate source ID")
                seen.add(sid)
                identity = prefix + sid
                original = {"id": identity, "source": source.upper(),
                            "source_id": sid, "listing": item,
                            "provenance": {"listing": "original_api"}}
                if source == "gov24":
                    for kind in ("detail", "conditions"):
                        path = folder / "details" / sid / (kind + ".json")
                        if not path.is_file():
                            original[kind] = None
                            counts[kind + "_missing"] += 1
                            continue
                        content = read(path)
                        raw_rows = content.get("rows")
                        valid = (
                            content.get("source_id") == sid
                            and content.get("endpoint") == kind
                            and isinstance(raw_rows, list)
                            and bool(raw_rows)
                            and all(isinstance(row, dict) and str(row.get("서비스ID", "")) == sid
                                    for row in raw_rows)
                        )
                        if not valid:
                            original[kind] = None
                            counts[kind + "_invalid_or_empty"] += 1
                        else:
                            original[kind] = content
                            counts[kind + "_available"] += 1
                            original["provenance"][kind] = "original_api"
                else:
                    # All 22 observed raw fields are already in original LIST.
                    counts["list_raw_fields_preserved"] += 1
                if baseline_ids is not None:
                    original["in_existing_snapshot"] = identity in baseline_ids
                    counts["existing_in_baseline" if identity in baseline_ids
                           else "missing_from_baseline"] += 1
                records.append(original)
        expected = manifest.get("reported_total")
        if len(records) != expected:
            raise ValueError(source + " list row count not equal source reported_total")
        write(output / (source + "-full-original.json"), records)
        report["sources"][source] = {
            "list_total":len(records), "reported_total":expected,
            "full_list_verified":True, **counts
        }
    write(output / "manual-full-data-report.json", report)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source-root",default="audit-artifacts/read-only-catalog")
    p.add_argument("--output-dir",default="audit-artifacts/manual-full-data")
    p.add_argument("--baseline",default="audit-artifacts/baseline.json")
    args = p.parse_args()
    baseline = Path(args.baseline)
    build(Path(args.source_root),Path(args.output_dir),
          baseline if baseline.is_file() else None)


if __name__ == "__main__":
    main()
