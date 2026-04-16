# 🩺 健保給付查詢

> 診所常見檢驗、影像、處置的健保給付頻率、點數與 ICD-10 對照查詢系統。純靜態網頁，GitHub Pages 託管。

## ✨ 功能

- 🔍 **關鍵字搜尋**：支援中英文、縮寫、代碼（HbA1c、糖化、A1C、09005C 都能找到糖化血色素）
- 📂 **分類瀏覽**：依檢驗別、影像別、處置別、疾病診斷分類過濾
- ⭐ **我的最愛**：釘選常查項目，localStorage 持久化
- 💰 **支付資訊**：每項顯示健保代碼、支付點數、頻率規定、ICD-10 對應
- 🌙 **深色模式**
- 📱 **RWD**：桌機、平板、手機通吃

## 🚀 本機啟動

```bash
cd nhi-query
python3 -m http.server 8765
# 瀏覽器打開 http://localhost:8765
```

## 📁 專案結構

```
nhi-query/
├── index.html              # 主頁 UI
├── assets/app.js           # 搜尋 / 過濾 / 最愛邏輯
├── data/
│   ├── data.json           # 主資料（手動維護 + 爬蟲補充）
│   └── raw/                # 爬蟲原始檔（.gitignore 可選）
├── scripts/
│   ├── fetch_nhi.py        # 從 data.gov.tw 抓支付標準
│   ├── parse_rules.py      # 規則萃取（regex + LLM）
│   └── build_index.py      # 合併資料為前端用 data.json
└── .github/workflows/
    └── deploy.yml          # GitHub Pages 自動部署
```

## 📝 資料維護

### 新增一筆項目

直接編輯 `data/data.json`，在 `items` 陣列加入：

```json
{
  "id": "09999C",
  "code": "09999C",
  "name_zh": "某某檢驗",
  "name_en": "Some Test",
  "aliases": ["縮寫", "ALIAS"],
  "category": "lab",
  "subcategory": "生化 / 腎功能",
  "points": 100,
  "frequency": "每 3 個月 1 次",
  "frequency_days": 90,
  "indications": ["N18", "E11"],
  "indication_desc": "CKD、糖尿病",
  "notes": "特殊給付規定…",
  "source_url": "https://info.nhi.gov.tw/INAE5000/INAE5001S01"
}
```

| category 值 | 對應類別 |
|---|---|
| `lab` | 檢驗 |
| `imaging` | 影像檢查 |
| `procedure` | 處置 / 衛教 |

### 從健保署重新爬取

```bash
pip install requests anthropic
python3 scripts/fetch_nhi.py            # 抓原始資料
python3 scripts/parse_rules.py          # 規則萃取
python3 scripts/parse_rules.py --use-llm  # （可選）用 Claude API 補強
python3 scripts/build_index.py          # 合併到 data.json
```

> ⚠ 健保署 dataset URL 可能變動。若 `fetch_nhi.py` 找不到下載連結，請至 [data.gov.tw/dataset/9405](https://data.gov.tw/dataset/9405) 手動複製最新 CSV/JSON URL。

## 🌐 部署到 GitHub Pages

1. 在 GitHub 建立公開 repo（例如 `nhi-clinic-query`）
2. ```bash
   git init
   git add .
   git commit -m "init: nhi clinic query system"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/nhi-clinic-query.git
   git push -u origin main
   ```
3. GitHub repo → **Settings** → **Pages** → Source 選 `main` branch `/` (root) → Save
4. 1-2 分鐘後開啟 `https://<你的帳號>.github.io/nhi-clinic-query/`

## ⚠ 免責聲明

本工具為臨床查詢輔助，資料以整理彙編為主。實際申報仍以健保署官方公告為準：

- [健保署支付標準查詢](https://info.nhi.gov.tw/INAE5000/INAE5001S01)
- [健保署醫療費用支付標準](https://www.nhi.gov.tw/ch/cp-5943-f1cce-2821-1.html)

## 📊 資料涵蓋範圍（第一版種子）

- **生化**：HbA1c、血糖、Lipid profile、肝腎功能、電解質、尿酸、甲狀腺
- **血液**：CBC、CRP、ESR、PT/INR、aPTT
- **尿液**：U/A、microalbumin/ACR
- **肝炎**：HBsAg、anti-HCV
- **腫瘤標記**：PSA
- **影像**：CXR、KUB、腰椎/膝 X 光、腹部/甲狀腺/乳房/心臟超音波、12-lead ECG、Holter
- **處置**：傷口處理、縫合、注射、點滴、噴霧治療
- **衛教**：DM / HTN 論質計酬、戒菸衛教
- **預防保健**：成人健檢、癌症篩檢（FIT、Pap、Mammography、肝炎）

目前 57+ 筆，持續擴充中。

## 📜 License

MIT
