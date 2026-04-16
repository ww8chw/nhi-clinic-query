#!/usr/bin/env python3
"""
build_index.py — 將手動維護的 items 與爬蟲產出的 parsed_rules 合併為前端用 data.json。

流程：
    1. 讀 data/data.json（手工維護版本，為主要資料）
    2. 可選讀 data/raw/parsed_rules.json（爬蟲產出，用於補充）
    3. 以 id/code 為 key 合併；手工資料優先
    4. 驗證必要欄位並輸出

用法：
    python3 scripts/build_index.py
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "data.json"
PARSED_PATH = ROOT / "data" / "raw" / "parsed_rules.json"

REQUIRED = ["id", "name_zh", "category", "frequency"]


def validate(items: list[dict]) -> list[str]:
    errors = []
    seen = set()
    for idx, it in enumerate(items):
        for k in REQUIRED:
            if not it.get(k):
                errors.append(f"#{idx} {it.get('id', '?')}: 缺欄位 {k}")
        if it.get("id") in seen:
            errors.append(f"#{idx} 重複 id: {it.get('id')}")
        seen.add(it.get("id"))
    return errors


def main() -> int:
    if not DATA_PATH.exists():
        print(f"找不到 {DATA_PATH}", file=sys.stderr)
        return 1

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    items: list[dict] = data.get("items", [])
    by_id = {it["id"]: it for it in items}

    if PARSED_PATH.exists():
        parsed = json.loads(PARSED_PATH.read_text(encoding="utf-8"))
        added = 0
        for row in parsed:
            code = str(row.get("代碼") or row.get("code") or "").strip()
            if not code or code in by_id:
                continue
            freq_info = row.get("_frequency") or {}
            by_id[code] = {
                "id": code,
                "code": code,
                "name_zh": row.get("診療項目中文名稱") or row.get("name_zh") or "",
                "name_en": row.get("診療項目英文名稱") or row.get("name_en") or "",
                "aliases": [],
                "category": "lab",  # 需後續人工判斷
                "subcategory": "未分類",
                "points": int(row.get("支付點數") or row.get("points") or 0) if str(row.get("支付點數") or row.get("points") or "").replace(".", "").isdigit() else 0,
                "frequency": freq_info.get("raw", row.get("frequency", "")),
                "frequency_days": freq_info.get("frequency_days", 0),
                "indications": row.get("_icd10", []),
                "indication_desc": "",
                "notes": row.get("給付規定") or row.get("notes") or "",
                "source_url": "https://info.nhi.gov.tw/INAE5000/INAE5001S01",
            }
            added += 1
        print(f"從 parsed_rules 補入 {added} 筆")

    final_items = list(by_id.values())
    errors = validate(final_items)
    if errors:
        print("驗證警告：")
        for e in errors[:20]:
            print(f"  - {e}")
        if len(errors) > 20:
            print(f"  ... 另有 {len(errors) - 20} 筆")

    data["items"] = final_items
    data.setdefault("meta", {})["updated_at"] = date.today().isoformat()
    data["meta"]["count"] = len(final_items)

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 合併完成：{len(final_items)} 筆項目")
    print(f"  → {DATA_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
