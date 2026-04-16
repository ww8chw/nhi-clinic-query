#!/usr/bin/env python3
"""
parse_rules.py — 從 raw 資料萃取頻率與 ICD-10 規則，合併到 data/data.json 的 items。

作法：
    1. 讀 data/raw/payment_standards.json（fetch_nhi.py 產出）
    2. 正則比對頻率句型：「每 N 天/週/月/年 1/N 次」
    3. 未匹配者可呼叫 Claude API 做語意萃取（需 ANTHROPIC_API_KEY）

用法：
    python3 scripts/parse_rules.py                 # 只用 regex
    python3 scripts/parse_rules.py --use-llm       # 搭配 Claude API 補足

輸出：
    data/raw/parsed_rules.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "payment_standards.json"
OUT = ROOT / "data" / "raw" / "parsed_rules.json"

# 單位 → 天數
UNIT_DAYS = {"日": 1, "天": 1, "週": 7, "周": 7, "星期": 7, "個月": 30, "月": 30, "年": 365}

FREQ_RE = re.compile(
    r"每\s*([0-9一二三四五六七八九十]+)\s*(日|天|週|周|星期|個月|月|年)\s*(?:.*?)(\d+)?\s*次"
)

CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def to_int(s: str) -> int:
    if s.isdigit():
        return int(s)
    # 中文數字支援 10, 12, 20 等
    if s == "十":
        return 10
    if len(s) == 2 and s[0] == "十":
        return 10 + CN_NUM.get(s[1], 0)
    if len(s) == 2 and s[1] == "十":
        return CN_NUM.get(s[0], 0) * 10
    return CN_NUM.get(s, 0)


def extract_frequency(text: str) -> dict | None:
    if not text:
        return None
    m = FREQ_RE.search(text)
    if not m:
        return None
    n, unit, times = m.groups()
    interval = to_int(n)
    days = interval * UNIT_DAYS.get(unit, 0)
    t = int(times) if times else 1
    return {
        "raw": m.group(0),
        "interval": interval,
        "unit": unit,
        "times": t,
        "frequency_days": days // max(t, 1),
    }


ICD_RE = re.compile(r"\b([A-Z]\d{2}(?:\.\d{1,2})?)\b")


def extract_icd10(text: str) -> list[str]:
    if not text:
        return []
    return sorted(set(ICD_RE.findall(text)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--use-llm", action="store_true", help="對 regex 未匹配的項目呼叫 Claude API")
    args = ap.parse_args()

    if not RAW.exists():
        print(f"找不到 {RAW}，請先執行 scripts/fetch_nhi.py", file=sys.stderr)
        return 1

    rows = json.loads(RAW.read_text(encoding="utf-8"))
    parsed = []
    unmatched = []
    for row in rows:
        rule_text = (
            row.get("給付規定")
            or row.get("備註")
            or row.get("notes")
            or ""
        )
        freq = extract_frequency(rule_text)
        icds = extract_icd10(rule_text)
        if freq:
            parsed.append({**row, "_frequency": freq, "_icd10": icds})
        else:
            unmatched.append(row)

    print(f"regex 匹配：{len(parsed)} 筆；未匹配：{len(unmatched)} 筆")

    if args.use_llm and unmatched:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("⚠ 未設 ANTHROPIC_API_KEY；略過 LLM。", file=sys.stderr)
        else:
            try:
                from anthropic import Anthropic  # type: ignore
            except ImportError:
                print("⚠ 未安裝 anthropic SDK，請執行：pip install anthropic", file=sys.stderr)
            else:
                client = Anthropic()
                SYSTEM = (
                    "你是健保給付規定萃取助手。輸入一段規則文字，"
                    "輸出 JSON：{frequency: str, frequency_days: int, indications: [ICD-10 codes], notes: str}。"
                    "frequency_days 為兩次檢查最少間隔天數；無法判斷則填 0。"
                )
                for row in unmatched[:30]:  # 限制呼叫數
                    text = row.get("給付規定") or row.get("備註") or ""
                    if not text:
                        continue
                    msg = client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=300,
                        system=SYSTEM,
                        messages=[{"role": "user", "content": text[:1500]}],
                    )
                    try:
                        extracted = json.loads(msg.content[0].text)  # type: ignore[attr-defined]
                        parsed.append({**row, **extracted, "_llm": True})
                    except Exception as e:
                        print(f"  LLM parse fail: {e}")

    OUT.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"→ {OUT}  ({len(parsed)} 筆)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
