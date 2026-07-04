# Aetheris Finale Votes

活動現場用的即時投票系統，包含觀眾端 `/vote` 與主辦後台 `/admin`。

## 啟動

```bash
npm start
```

預設網址：

- 觀眾端：http://localhost:3000/vote
- 主辦後台：http://localhost:3000/admin

預設後台密碼是 `admin123`，正式活動建議用環境變數覆蓋：

```bash
ADMIN_PASSWORD=your-password npm start
```

若部署環境有 persistent disk，可以用 `DATA_DIR` 指定票數狀態檔存放位置：

```bash
DATA_DIR=/data ADMIN_PASSWORD=your-password npm start
```

## 功能

- 10 題，每題 4 個選項
- 觀眾匿名 UUID 識別
- 投票中可改票或再次點擊取消
- 主辦可開始、鎖定、等待、重置本題、切換題目、重置全部
- 後台即時顯示票數與比例
- 後台可直接編輯題目與選項
- SSE 即時同步，投票計算集中在伺服器端完成

投票狀態會寫入 `data/state.json`，此檔案已被 `.gitignore` 排除，避免活動票數被提交進版本庫。

## 部署上線

這個版本使用常駐 Node.js server 與 SSE 即時同步，建議部署到支援長時間執行服務的平台，例如 Render、Railway、Fly.io 或一台 VPS。若部署到 Vercel/Netlify 這類 Serverless 平台，SSE 與本機檔案保存不適合直接使用，建議改接 Firebase Realtime Database 或 Supabase Realtime。

### Render 範例

此 repo 已包含 `render.yaml`，可用 Render Blueprint 建立服務：

1. 將專案推到 GitHub。
2. 到 Render Dashboard 點 `New` -> `Blueprint`。
3. 選擇這個 repo，Render 會讀取 `render.yaml`。
4. 填入 `ADMIN_PASSWORD`。
5. 套用 Blueprint 後等待部署完成。
6. 部署完成後，開啟 `https://你的網域/vote` 給觀眾掃 QR code，`https://你的網域/admin` 給主辦操作。

也可以不用 Blueprint，手動建立 `Web Service`：

- Runtime：`Node`
- Build Command：`npm install`
- Start Command：`npm start`
- Environment Variables：`ADMIN_PASSWORD=你的後台密碼`，`DATA_DIR=/data`
- Region：建議選 `Singapore`
- Disk：掛載到 `/data`，大小 1 GB 即可

### 重要提醒

- 免費平台可能會休眠，活動前務必提前打開後台暖機。
- 多台 instance 會造成票數狀態不同步；請先使用單一 instance。
- `data/state.json` 是本機檔案，平台重啟可能清空或回復。正式大型活動建議改接 Firebase/Supabase，或在部署平台掛 persistent disk。
- 若使用自己的網域，請確認 HTTPS 已啟用，手機瀏覽器才會穩定允許 localStorage 與即時連線。
- QR code 目前由公開服務即時產生；若場地網路會擋外部圖片，建議部署後先下載 QR 圖，改成放在 `img/` 內當本機素材。
