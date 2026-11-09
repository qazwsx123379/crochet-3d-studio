# 鉤織 3D 工作室

寫下每一圈鉤織織圖，馬上看到 3D 成品。

## 目前進度

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| 0 地基 | Google 登入、Firestore 雲端資料（離線可看）、GitHub Pages 自動上線 | 程式完成，合併到 main 後上線 |
| 1 織圖語法 | `(FV)*6`、巢狀重複、`[3F]`、`BLO(…)`、`R8-R12`、中文輸入、自動算針數 | 完成，待驗收 |
| 2 織圖編輯器 | 針法按鈕（可拖拉排序、快捷鍵）、逐圈編輯、備註、復原／重做、作品庫 | 完成，待驗收 |
| 3 顏色與符號圖 | 色票盤、品牌色、點一針／拖一段／整圈上色、符號圖兩種上色方式 | 完成，品牌色號待補 |
| 4 3D 基本形狀 | 依針數算出形狀（繞圈、橢圓起針、片織）、視角、自動旋轉、逐圈播放、點選對應 | 完成，待驗收 |
| 5 3D 擬真 | 每針紋理、塞棉花、立體花樣針、翻轉、白底／透明背景 | 完成，待驗收 |

正式網站登入 Google 後，作品存在 Firestore 的 `users/{你的 uid}/…`，只有你自己讀寫得到。第一次登入時會把這台瀏覽器原本的作品（沒有的話就是範例）匯入帳號。
claude.ai 預覽版（`npm run build:preview`）不登入，作品存在瀏覽器的 localStorage，也不打包 Firebase。所有存取都集中在 `src/store/store.ts`。

推送到 `main` 時，`.github/workflows/deploy.yml` 會自動測試、打包並發布到 https://qazwsx123379.github.io/crochet-3d-studio/ （需要在 repo 的 Settings → Pages 把 Source 設成 GitHub Actions）。

## 開發

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # 語法解析、針數檢查、3D 形狀的自動測試
npm run build          # 型別檢查 + 正式版打包到 dist/
npm run build:preview  # 打包成單一 HTML（dist-preview/artifact.html），給 claude.ai 預覽頁用
```

## 程式結構

| 路徑 | 內容 |
| --- | --- |
| `src/pattern/stitches.ts` | 針法庫：每種針法用掉幾針、產生幾針、高度、形狀 |
| `src/pattern/parser.ts` | 把一圈的文字解析成一針一針 |
| `src/pattern/analyze.ts` | 把各行展開成實際的圈，檢查針數 |
| `src/pattern/colors.ts` | 每一針的顏色 |
| `src/three/geometry.ts` | 從針數算出 3D 形狀（不含繪圖，可測試） |
| `src/three/Preview3D.tsx` | three.js 畫面、針目紋理、點選 |
| `src/ui/` | 作品庫、編輯器、符號圖、對話框 |
| `src/store/` | 資料存取（`store.ts`）、Firebase（`cloud.ts`）、範例零件、線材色 |
| `src/themes.ts` | 6 套主題色 |

## 3D 形狀怎麼算

每一圈的上緣是一個圈，長度 = 針數 × 針寬；相鄰兩圈相距一個針高。
半徑增加約一個針高時布面是平的（圓片），針數不變時直直往上，減針時往內收。
所以形狀直接由織圖決定，不需要預先準備模型。鎖針起針的橢圓用「兩條直邊加兩個半圓」，片織則一行一行疊成布片。
