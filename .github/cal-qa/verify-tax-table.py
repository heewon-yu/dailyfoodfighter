"""Compare every statutory withholding cell with an official NTS XLSX.
Run: python3 -m pip install openpyxl
     python3 .github/cal-qa/verify-tax-table.py /path/to/official.xlsx
Source: https://teht.hometax.go.kr/doc/sf/a/a/근로소득%20간이세액표_2026.03.01.xlsx
Fails closed: missing rows, conflicting cells or incomplete matching are failures.
"""
import json, re, sys
from pathlib import Path
from openpyxl import load_workbook

text = Path("cal/index.html").read_text(encoding="utf-8")
raw = re.search(r"const TAX_DATA_2026=(\{[^\n]+\});", text)
assert raw, "Tax data missing"
data = json.loads(raw.group(1))
expected = {tuple(r[:2]): tuple(r[2:]) for r in data["rows"]}

def number(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int,float)) and v == int(v):
        return int(v)
    if isinstance(v,str):
        s=v.strip().replace(",","")
        if s in ("-","–","—"):
            return 0
        if s.isdigit():
            return int(s)
    return None

seen={}
high=[]
wb=load_workbook(sys.argv[1], read_only=True, data_only=True)
for sh in wb:
    for row in sh.iter_rows(values_only=True):
        for i in range(len(row)-12):
            start=number(row[i])
            end=number(row[i+1])
            key=(start,end)
            if key not in expected:
                continue
            vals=tuple(number(v) for v in row[i+2:i+13])
            # In source tables, blank tax cells can mean zero.
            if any(v is None and raw is not None for v,raw in zip(vals,row[i+2:i+13])):
                continue
            vals=tuple(v if v is not None else 0 for v in vals)
            if key in seen and seen[key]!=vals:
                raise AssertionError(f"Conflicting source rows {key}")
            seen[key]=vals
        # 10,000-thousand reference row may have a merged range.
        for i in range(len(row)-11):
            if number(row[i])!=10000:
                continue
            for offset in (1,2):
                vals=tuple(number(v) for v in row[i+offset:i+offset+11])
                if len(vals)==11 and all(v is not None for v in vals):
                    high.append(vals)
missing=set(expected)-set(seen)
mismatch=[(k,expected[k],seen[k]) for k in expected if k in seen and seen[k]!=expected[k]]
assert not missing, f"Missing {len(missing)} ranges: {sorted(missing)[:10]}"
assert not mismatch, f"Mismatch {len(mismatch)} rows: {mismatch[:5]}"
assert tuple(data["high"]) in high, "10m reference row not matched"
print(f"PASS: {len(expected)} ranges / {len(expected)*11} tax cells and high salary row")
