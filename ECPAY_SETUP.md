# yifly 綠界付款後端設定

此專案的前端在 `github-pages/`，付款後端在 `worker/`。所有 ECPay 密鑰只放 Cloudflare Worker Secrets，絕不可放進 GitHub Pages 或 Git。

## 1. 建立資料庫與 Worker

```bash
cd worker
npx wrangler login
npx wrangler d1 create yifly-payments
```

把輸出的 `database_id` 填入 `worker/wrangler.toml` 的 `database_id`。接著建立資料表：

```bash
npx wrangler d1 execute yifly-payments --remote --file=schema.sql
```

## 2. 設定機密與部署

依序執行下列指令；輸入值時不要貼到 source code、Git 或聊天紀錄。

```bash
npx wrangler secret put ECPAY_MERCHANT_ID
npx wrangler secret put ECPAY_HASH_KEY
npx wrangler secret put ECPAY_HASH_IV
npx wrangler secret put ECPAY_ENV
npx wrangler deploy
```

`ECPAY_ENV` 填 `stage` 或 `production`。部署輸出會提供 Worker URL，例如 `https://yifly-ecpay.<account>.workers.dev`。將它填入 `github-pages/payment.js` 的 `paymentApiOrigin`，再發布 GitHub Pages。

Worker 的 ReturnURL 自動是：`https://你的-worker/api/payment/callback`；ECPay 的 OrderResultURL 會回到 `https://yoeeeeee.github.io/yifly/support-success.html`。請確認 ECPay 後台允許此 ReturnURL。

## 3. 測試與上線

先用官方 Stage Merchant 資料與 `ECPAY_ENV=stage` 測試 NT$50，確認 Worker D1 `orders` 的狀態從 `pending` 變成 `paid`，且綠界後台交易一致。Callback 收到合法付款成功後才會回覆 `1|OK` 並標記 paid；瀏覽器跳轉不會改變狀態。

正式上線時，以 `wrangler secret put` 覆蓋三個正式資料與 `ECPAY_ENV=production`，再做第一筆 NT$50 實際付款，核對 ECPay 後台、D1 訂單與成功頁狀態。

## Apple Pay

全方位金流文件指出 `Credit` 在 2025-04-01 起可同步顯示 Apple Pay，但只會在 Safari 顯示且仍須你的綠界商店已開通資格。現行程式固定 `ChoosePayment=Credit`；先完成信用卡驗證。若 Apple Pay 未出現，請向 ECPay 確認商店 Apple Pay 開通狀態與必要的 Apple Merchant ID／憑證設定，再調整付款方式，勿在前端偽造 Apple Pay。
