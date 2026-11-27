#!/usr/bin/env python3
"""Read-only comparison of original Gov24/Bizinfo API pages with local D1 audit snapshot."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from collections import Counter

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def analyze(root, baseline):
    existing = {str(item["id"]) for item in baseline["programs"]}
    out = {"baseline_total":len(existing), "sources":{}}
    for source,prefix in (("gov24","GOV24:"),("bizinfo","BIZINFO:")):
        directory = root / source
        if not (directory/"manifest.json").exists():
            out["sources"][source]={"status":"NOT_COLLECTED"}
            continue
        state=load_json(directory/"manifest.json")
        seen=set()
        duplicates=[]
        missing=[]
        candidates=[]
        ids=[]
        for path in sorted(directory.glob("page-*.json")):
            data=load_json(path)
            for raw in data["rows"]:
                rid=str(raw.get("서비스ID") if source=="gov24"
                        else raw.get("pblancId") or raw.get("seq") or "")
                if rid in seen:
                    duplicates.append(rid)
                seen.add(rid)
                ids.append(rid)
                identity=prefix+rid
                if identity not in existing:
                    missing.append(identity)
                title=str(raw.get("서비스명") if source=="gov24"
                          else raw.get("pblancNm") or raw.get("title") or "")
                issuer=str(raw.get("소관기관명") if source=="gov24"
                           else raw.get("jrsdInsttNm") or "")
                # Candidate only: matching name/issuer is NOT proof of nationwide eligibility.
                if any(token in title for token in (
                    "부모급여","아동수당","유아학비","주거급여","기초연금",
                    "국민취업지원","내일배움카드","첫만남이용권",
                    "보육료","장애인연금","정책자금","지원사업")):
                    candidates.append({"id":identity,"title":title,"agency":issuer})
        expected=state.get("reported_total")
        complete=bool(state.get("complete") and state.get("paging_finished")
                      and expected is not None and len(seen)==expected
                      and not duplicates)
        out["sources"][source]={
            "source_complete":complete,"reported_total":expected,"unique_ids":len(seen),
            "rows":len(ids),"duplicates":len(duplicates),
            "missing_from_baseline":len(missing),
            "missing_id_samples":missing[:30],
            "national_review_candidates":len(candidates),
            "candidate_samples":candidates[:50]
        }
    return out

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source-root",default="audit-artifacts/read-only-catalog")
    p.add_argument("--baseline",default="audit-artifacts/baseline.json")
    p.add_argument("--output",default="audit-artifacts/source-parity-report.json")
    args=p.parse_args()
    report=analyze(Path(args.source_root),load_json(Path(args.baseline)))
    path=Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({
        "baseline_total":report["baseline_total"],
        "sources":{k:{key:v.get(key) for key in
                     ("source_complete","reported_total","unique_ids","duplicates","missing_from_baseline")}
                   for k,v in report["sources"].items()}
    },ensure_ascii=False))
    print("Local report:",path)

if __name__=="__main__":
    main()
