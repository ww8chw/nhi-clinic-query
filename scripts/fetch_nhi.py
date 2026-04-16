#!/usr/bin/env python3
"""
fetch_nhi.py — 從健保署與政府資料開放平台抓取支付標準原始資料。

輸出：
    data/raw/payment_standards.json  — 所有給付項目（代碼、名稱、點數）
    data/raw/payment_rules.txt       — 給付規定條文（未結構化）

用法：
    python3 scripts/fetch_nhi.py

注意：
    - 健保署資料多為 PDF / Excel，本腳本先抓 data.gov.tw 上的 CSV/JSON。
    - 給付規定條文需手工或用 LLM 後處理（見 parse_rules.py）。
    - 實際 dataset ID 可能會異動，請至 data.gov.tw 搜尋「醫療服務給付項目及支付標準」確認。
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("缺少 requests 套件，請執行：pip install requests", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# 政府資料開放平台 dataset：「醫療服務給付項目及支付標準」
# https://data.gov.tw/dataset/9405
# 注意：實際 resource URL 可能變動，請去該頁面右鍵「資料下載網址」更新。
DATASET_ID = "9405"
DATASET_PAGE = f"https://data.gov.tw/dataset/{DATASET_ID}"

# 常見代碼前綴（診所關切）
TARGET_PREFIXES = (
    "08",  # 血液
    "09",  # 生化
    "06",  # 尿液
    "12",  # 特殊免疫/內分泌
    "13",  # 病毒學
    "18",  # 心電圖
    "19",  # 超音波
    "32",  # X 光
    "47",  # 注射
    "50",  # 傷口 / 小手術
    "55",  # 物理治療
    "57",  # 呼吸治療
    "92",  # 衛教
    "P",   # P4P 代碼
)


def fetch(url: str, timeout: int = 30) -> bytes:
    print(f"  GET {url}")
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "nhi-query-fetch/0.1"})
    r.raise_for_status()
    return r.content


def discover_resource_urls() -> list[str]:
    """從 data.gov.tw dataset 頁面抓取實際下載 URL。

    策略：抓 HTML，找出 .csv / .xml / .json 資源連結。
    由於結構可能變動，本函式僅示意；請視需要手動替換為你在頁面上複製的 URL。
    """
    try:
        html = fetch(DATASET_PAGE).decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  無法抓 dataset 頁面：{e}")
        return []
    urls: list[str] = []
    for ext in (".csv", ".CSV", ".xml", ".json"):
        idx = 0
        while True:
            idx = html.find(ext, idx + 1)
            if idx == -1:
                break
            start = max(html.rfind('"', 0, idx), html.rfind("'", 0, idx))
            end = idx + len(ext)
            u = html[start + 1 : end]
            if u.startswith("http"):
                urls.append(u)
    return sorted(set(urls))


def filter_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for row in rows:
        code = str(row.get("code") or row.get("代碼") or row.get("診療項目代碼") or "").strip()
        if not code:
            continue
        if not any(code.startswith(p) for p in TARGET_PREFIXES):
            continue
        out.append(row)
    return out


def main() -> int:
    print(f"[1/3] 探索 dataset {DATASET_ID} 的資源連結…")
    urls = discover_resource_urls()
    if not urls:
        print("  ⚠ 未找到下載連結。請至以下頁面手動複製最新 CSV / JSON 連結，")
        print(f"     並貼到本腳本 RESOURCE_URLS：\n     {DATASET_PAGE}")
        return 1

    print(f"  找到 {len(urls)} 個候選下載連結：")
    for u in urls:
        print(f"    - {u}")

    print("\n[2/3] 下載並存檔到 data/raw/")
    saved = []
    for u in urls:
        fname = os.path.basename(urlparse(u).path) or f"resource-{int(time.time())}"
        path = RAW_DIR / fname
        try:
            content = fetch(u)
            path.write_bytes(content)
            saved.append(path)
            print(f"  ✓ {path.name}  ({len(content):,} bytes)")
        except Exception as e:
            print(f"  ✗ {u}: {e}")

    print("\n[3/3] 解析 JSON/CSV → payment_standards.json")
    all_rows: list[dict[str, Any]] = []
    for p in saved:
        if p.suffix.lower() == ".json":
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                rows = data if isinstance(data, list) else data.get("result", {}).get("records", [])
                all_rows.extend(rows)
            except Exception as e:
                print(f"  parse {p.name}: {e}")
        elif p.suffix.lower() == ".csv":
            try:
                import csv
                with p.open(encoding="utf-8-sig", errors="ignore") as f:
                    for row in csv.DictReader(f):
                        all_rows.append(row)
            except Exception as e:
                print(f"  parse {p.name}: {e}")

    filtered = filter_rows(all_rows)
    out_path = RAW_DIR / "payment_standards.json"
    out_path.write_text(json.dumps(filtered, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ 共抓取 {len(all_rows)} 筆原始資料；過濾後保留 {len(filtered)} 筆診所常見項目")
    print(f"  → {out_path}")
    print("\n下一步：執行 scripts/parse_rules.py 萃取給付頻率規定（或手動補 data/data.json）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
