#!/usr/bin/env python3
"""마무리: 채널 이름 공백 정리, 누락 채널 키 보충, 모든 channel 참조가 키에 존재하도록 맞춘다."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "abroads.js"
SUBS3 = ROOT / "data" / "ab2_subs3.json"


def main():
    s = MAP.read_text()
    subs = json.loads(SUBS3.read_text())
    abroad_subs = json.loads((ROOT / "data" / "abroad_subs.json").read_text())
    cand = json.loads((ROOT / "data" / "ab2_cand2.json").read_text())
    name2cid = {n: v["channelId"] for n, v in abroad_subs.items() if v.get("channelId")}
    for c in cand:
        if c.get("channelId"):
            name2cid.setdefault(c["channel"].strip(), c["channelId"])

    # 1) 참조 이름 공백 정리
    refs = set(re.findall(r'channel:"((?:[^"\\]|\\.)*)"', s))
    fix = {r: r.strip() for r in refs if r != r.strip()}
    for old, new in fix.items():
        s = s.replace(f'channel:"{old}"', f'channel:"{new}"')
    refs = {r.strip() for r in refs}
    old_subs = {k.strip(): int(v) for k, v in re.findall(r'^    "(.+?)": (\d+),$', s, re.M)}

    # 1-2) 채널명이 어색한 협업 표기·구독자 비공개 채널 리뷰는 정리
    DROP = {"아이랑다닌곳들", "아아포샷"}
    for nm in list(refs):
        if " 및 " in nm or nm in DROP:
            s = re.sub(r'\n        \{review:"[^"]*", channel:"%s", id:"[^"]*", start:null\},' % re.escape(nm), "", s)
            refs.discard(nm)
    MANUAL = {"큰손 노희영": 581000, "여니버스": 114000}
    # 2) 누락 채널 키 보충
    out = {}
    for nm in refs:
        val = old_subs.get(nm)
        if val is None:
            cid = name2cid.get(nm)
            val = subs.get(cid, {}).get("subs") if cid else None
        if val is None:
            nm_ab = abroad_subs.get(nm, {})
            val = nm_ab.get("subs")
        out[nm] = val or MANUAL.get(nm, 0)
    lines = ["  channels: {"]
    for nm in sorted(out, key=lambda n: -out[nm]):
        lines.append(f"    {json.dumps(nm, ensure_ascii=False)}: {out[nm]},")
    lines.append("  },")
    s = re.sub(r"  channels: \{.*?\n  \},", "\n".join(lines), s, count=1, flags=re.S)
    MAP.write_text(s)
    missing = [n for n in refs if n not in out]
    print("channels", len(out), "missing", missing)
    print("zeros", [n for n, v in out.items() if not v])


if __name__ == "__main__":
    main()
