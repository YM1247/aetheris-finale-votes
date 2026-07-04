# AGENT.md - 即時活動投票系統開發規範

## 1. 專案目標與核心規格
開發一個適用於活動現場的低延遲、高穩定即時投票系統。
* **題數規模**：共 10 題，每題固定 4 個選項。
* **核心架構**：分為觀眾端（前台）與主辦端（後台）。

## 2. 技術選型 (Tech Stack)
* **前端框架**：Next.js (React) 或 Vue 3 (SPA 路由區分 `/vote` 與 `/admin`)
* **即時後端**：Firebase Realtime Database 或 Supabase Realtime
* **樣式/UI**：Tailwind CSS + shadcn/ui (若使用 React)
* **數據圖表**：Recharts 或 Chart.js (後台專用)
* **部署平台**：Vercel / Netlify

## 3. 資料結構 (Schema Design)

```

```text
File AGENT.md written successfully.

```json
{
  "systemState": {
    "currentQuestionId": "string (e.g., 'q1')",
    "status": "string ('waiting' | 'active' | 'locked')"
  },
  "questions": {
    "q1": {
      "title": "string",
      "options": { "optA": "string", "optB": "string", "optC": "string", "optD": "string" },
      "voteCounts": { "optA": "number", "optB": "number", "optC": "number", "optD": "number" }
    }
  },
  "userVotes": {
    "user_uuid_string": {
      "q1": "string (e.g., 'optA')"
    }
  }
}

```

## 4. 功能邏輯與開發規範

### 觀眾端 (前台 `/vote`)

1. **匿名識別**：進入網頁時，於 `localStorage` 檢查或生成隨機 UUID，作為唯一識別碼。
2. **即時同步**：監聽 `systemState`。
* `waiting`：顯示「等待主持人開放投票」。
* `active`：解鎖並渲染 `currentQuestionId` 對應之題目與 4 個選項。
* `locked`：將選項按鈕設為 `disabled` 灰色狀態，顯示「投票已結束」。


3. **投票行為控制**：
* 未投狀態點擊：目標選項票數 +1，更新 `userVotes`。
* 已投狀態再次點擊：原選項票數 -1，清除 `userVotes` 該題紀錄。
* 已投狀態點擊他項：原選項票數 -1，新選項票數 +1，更新 `userVotes`。
* 限制：在 `status === 'active'` 期間允許無限次更改。



### 主辦端 (後台 `/admin`)

1. **安全驗證**：進入路由需進行基本密碼或身份驗證。
2. **即時監控面板**：讀取當前題目的 `voteCounts`，即時渲染為長條圖/圓餅圖，動態顯示票數與百分比。
3. **控制元件**：
* `開始投票`：變更 `systemState.status` 為 `active`。
* `鎖定投票`：變更 `systemState.status` 為 `locked`。
* `重置本題`：將當前題目的 `voteCounts` 歸零，清除 `userVotes` 中該題的所有紀錄。
* `上下一題`：變更 `systemState.currentQuestionId`，並同步將 `status` 重置為 `waiting`。



## 5. 關鍵實作防禦線

* **併發寫入處理 (Race Condition)**：投票票數增減**必須**使用資料庫的原子操作 (Atomic Operations)，如 Firebase 的 `Transaction` 或 `ServerValue.increment()`，嚴禁使用先讀取再覆寫的邏輯。
* **使用者體驗**：網路請求發出至確認成功期間，按鈕應呈現 Loading 狀態，防止使用者連續點擊造成數據異常。
即時投票系統。
* **規模**：10 題，每題固定 4 個選項。
* **架構**：觀眾端（前台）、主辦端（後台）。
* **原子操作**：票數增減**嚴禁**讀取後覆寫，必須依賴資料庫端原子操作 (如 Firebase `Transaction` / `ServerValue.increment`) 防範併發寫入異常。