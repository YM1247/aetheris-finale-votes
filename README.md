# Aetheris Finale Votes

活動現場用的即時投票系統，包含觀眾端 `/vote` 與主辦後台 `/admin`。目前使用 Firebase Anonymous Authentication、Realtime Database 與 Firebase Hosting。

## 啟動

```bash
npm start
```

預設網址：

- 觀眾端：http://localhost:3000/vote
- 主辦後台：http://localhost:3000/admin

本機 `npm start` 只負責提供靜態頁面；實際投票資料會寫入 Firebase Realtime Database。舊版本機 `/api/*` 已停用，避免出現另一套後台入口。

## 功能

- 10 題，每題 4 個選項
- 觀眾 Firebase 匿名登入識別
- 投票中可改票或再次點擊取消
- 主辦可開始、鎖定、等待、重置本題、切換題目、重置全部票數
- 後台即時顯示票數與比例
- 後台可直接編輯題目與選項
- Firebase Realtime Database 即時同步
- 後台 token 存在 Realtime Database 的不可讀節點，由 Database Rules 在後端比對
- 後台從 `userVotes` 即時彙總票數，避免多人同時投票時直接競爭票數計數器

Firebase Hosting 會部署 `public/`，因此圖片素材已放在 `public/img/`。

## 部署上線

### Firebase Hosting + Realtime Database

此版本已可用 Firebase Hosting + Realtime Database 部署，不需要 Render 常駐 server，也不需要 Blaze 方案。

第一次設定：

1. 到 Firebase Console 啟用 Authentication 的 `Anonymous` 登入方式。
2. 啟用 Realtime Database。此專案目前使用 `https://aetheris-finale-votes-default-rtdb.asia-southeast1.firebasedatabase.app/`。
3. 在 Realtime Database Console 匯入 `database.seed.json` 作為初始資料。
4. 在 Realtime Database Console 修改根目錄的 `adminToken`，改成活動用 token。此節點 rules 設定為不可讀，前端讀不到。

5. 部署 rules 與 hosting：

```bash
firebase deploy --only database,hosting
```

部署完成後：

- 觀眾端：`https://aetheris-finale-votes.web.app/vote`
- 主辦後台：`https://aetheris-finale-votes.web.app/admin`

後台登入使用 Realtime Database 根目錄的 `adminToken`。token 不會寫在前端程式碼裡；前端只把使用者輸入的 token 寫入自己的 `adminSessions/{uid}`，Database Rules 會在 Firebase 後端比對是否等於不可讀的 `adminToken`。觀眾端使用 Firebase 匿名登入，票數由後台即時彙總 `userVotes`，不再使用本機 `data/state.json`。

### Render

Render 也可以部署這個 repo，但現在 Render 只會作為靜態頁面伺服器；資料仍會走 Firebase Realtime Database。舊版 `/api/*` 在 Node server 會回傳停用狀態，不再接受投票或後台控制。若使用 Firebase Hosting，通常不需要再部署 Render。

### Render 範例

此 repo 已包含 `render.yaml`，可用 Render Blueprint 建立服務：

1. 將專案推到 GitHub。
2. 到 Render Dashboard 點 `New` -> `Blueprint`。
3. 選擇這個 repo，Render 會讀取 `render.yaml`。
4. 套用 Blueprint 後等待部署完成。
5. 部署完成後，開啟 `https://你的網域/vote` 給觀眾掃 QR code，`https://你的網域/admin` 給主辦操作。

也可以不用 Blueprint，手動建立 `Web Service`：

- Runtime：`Node`
- Build Command：`npm install`
- Start Command：`npm start`
- Environment Variables：可留空，後台 token 由 Firebase Realtime Database 的 `adminToken` 控制
- Region：建議選 `Singapore`
- Disk：不需要

### 重要提醒

- 後台 token 不在前端程式碼裡；請在 Realtime Database Console 修改 `adminToken`。
- `adminToken` 不可被前端讀取，但具有 token 的使用者可以建立自己的 admin session。
- 若後台登入出現 `PERMISSION_DENIED`，請確認 Realtime Database 根目錄有 `adminToken` 字串、輸入內容與它完全一致，並已執行 `firebase deploy --only database,hosting` 部署最新 rules。
- Firebase project 的 Realtime Database URL 若更換，必須同步修改 `public/app.js`。
- 若使用自己的網域，請確認 HTTPS 已啟用，手機瀏覽器才會穩定允許 localStorage 與即時連線。
- QR code 目前由公開服務即時產生；若場地網路會擋外部圖片，建議部署後先下載 QR 圖，改成放在 `img/` 內當本機素材。
