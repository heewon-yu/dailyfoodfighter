#!/usr/bin/env python3
"""채널 이름 표기를 하나로 합치고(같은 채널의 짧은/긴 이름), 구독자 수를 영상 업로더 기준으로 다시 채운다."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "map" / "abroads.js"


def norm(x):
    return re.sub(r"[^0-9a-z가-힣]", "", x.lower())


def main():
    s = MAP.read_text()
    keys = re.findall(r'^    "(.+?)": (\d+),$', s, re.M)
    names = [k for k, _ in keys]
    old_subs = {k: int(v) for k, v in keys}
    cand = json.loads((ROOT / "data" / "ab2_cand2.json").read_text())
    abroad_subs = json.loads((ROOT / "data" / "abroad_subs.json").read_text())
    subs2 = json.loads((ROOT / "data" / "ab2_subs2.json").read_text())

    # 1) 같은 채널 이름 합치기 (한쪽이 다른 쪽의 접두/부분 문자열)
    rename = {}
    used = set()
    ordered = sorted(names, key=len, reverse=True)
    for a in ordered:
        na = norm(a)
        if not na or a in used:
            continue
        group = [b for b in names if b != a and b not in used and na and norm(b) and
                 (norm(b) in na or na in norm(b)) and min(len(na), len(norm(b))) >= 4]
        if len(group):
            # 1차 짧은 이름(기존 키)을 대표로 유지
            keep = min([a] + group, key=len)
            for g in [a] + group:
                if g != keep:
                    rename[g] = keep
                    used.add(g)
            used.add(keep)

    # 2) 채널별 업로더 채널 ID (영상 기준)
    name2cid = {}
    for c in cand:
        nm = c["channel"]
        nm = rename.get(nm, nm)
        if c.get("channelId") and nm not in name2cid:
            name2cid[nm] = c["channelId"]
    for nm, v in abroad_subs.items():
        if v.get("channelId"):
            name2cid.setdefault(rename.get(nm, nm), v["channelId"])

    # 3) 구독자 수: 검증된 업로더 채널 홈에서
    out_subs = {}
    missing = []
    for nm in set(rename.values()) | {n for n in names if n not in rename}:
        val = None
        cid = name2cid.get(nm)
        if cid and subs2.get(cid, {}).get("subs"):
            val = subs2[cid]["subs"]
        if val is None and nm in abroad_subs and abroad_subs[nm].get("subs"):
            val = abroad_subs[nm]["subs"]
        if val is None:
            val = old_subs.get(nm, 0)
        if not val:
            missing.append(nm)
        out_subs[nm] = val
    # 이름 변경 적용
    for old, new in rename.items():
        s = s.replace(f'channel:"{old}"', f'channel:"{new}"')
    # 채널 블록 재작성
    lines = ["  channels: {"]
    for nm in sorted(out_subs, key=lambda n: -out_subs[n]):
        lines.append(f"    {json.dumps(nm, ensure_ascii=False)}: {out_subs[nm]},")
    lines.append("  },")
    s = re.sub(r"  channels: \{.*?\n  \},", "\n".join(lines), s, count=1, flags=re.S)
    MAP.write_text(s)
    print("renamed", len(rename), list(rename.items())[:8])
    print("channels", len(out_subs), "missing", missing)
    # 채널 이름이 모두 키에 있는지
    used = set(re.findall(r'channel:"((?:[^"\\]|\\.)*)"', s))
    print("unmapped", [u for u in used if u not in out_subs])


if __name__ == "__main__":
    main()
