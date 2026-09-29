# Codex 執行規則

## 瀏覽器使用限制

除非我明確要求，禁止使用 Browser / Computer Use / 網頁 UI 操作。

所有可以透過 CLI、Terminal、API 或直接修改檔案完成的工作，
一律在背景使用 CLI 完成。

優先順序：

1. 直接讀寫專案檔案
2. Terminal / CLI
3. 官方 API
4. curl
5. Wrangler CLI
6. Git CLI

不要為了以下工作開啟瀏覽器：

- Cloudflare Dashboard
- GitHub 網站
- 查看部署結果
- Worker 部署
- D1 操作
- Secrets 狀態確認
- Git commit / push
- API 測試
- npm build / test
- 查看網站是否上線

Cloudflare 一律優先使用 Wrangler CLI。

GitHub 一律優先使用 git / gh CLI。

API 測試優先使用 curl。

## 必須人工操作的情況

只有 CLI 無法完成，且確實需要：

- OAuth / Cloudflare 登入授權
- CAPTCHA
- ECPay 後台人工設定
- 實際信用卡 / Apple Pay 付款
- 其他必須由使用者確認的安全操作

才停止工作並告訴我需要做什麼。

不要自行開啟瀏覽器代替我操作。

## Token / 額度節省

優先使用最低 token / tool usage 完成工作。

- 不要重複讀取已知檔案
- 不要重複 build
- 不要重複測試已成功項目
- 不要進行無關重構
- 不要操作瀏覽器確認可由 CLI 確認的結果
- 中斷後先檢查現況，再從未完成步驟繼續
- 已完成的工作不要重新執行

## ECPay / Secrets

任何 ECPay Secret 不得：

- 寫入 source code
- commit 到 Git
- 顯示在回覆
- 顯示在 log

Secret 一律使用 Cloudflare Wrangler Secrets。

需要我輸入 Secret 時停止並通知我，由我自行在 Terminal 輸入。