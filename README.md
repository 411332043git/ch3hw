# 好多人・兩個人

可愛馬卡龍風格的即時聊天室：訪客用「好多人」匿名群組和「兩個人」一對一聊天室，縵（站長）登入後管理所有對話。

目前是**階段一：只有前端、示範模式**（還沒有接 Supabase）。訊息只存在你自己的瀏覽器裡，同一個瀏覽器開兩個分頁可以互相同步，用來測試「訪客」和「縵」的來回效果。

## 在自己的電腦上預覽

網頁不能直接雙擊 `index.html` 打開（瀏覽器會擋住程式模組），要透過一個小小的本機網頁伺服器：

- **Windows**：雙擊 `start-preview.bat`，會自動打開 http://localhost:8080/
- 或在這個資料夾打開終端機，輸入：`python dev-server.py`，再用瀏覽器打開 http://localhost:8080/（這個伺服器每次都給最新的檔案，改了程式重新整理就會看到）

不需要安裝任何東西，也沒有「建置」步驟（沒有 node_modules、dist）。

**用手機看**：手機和電腦連同一個 Wi-Fi，用手機瀏覽器打開 `start-preview.bat` 視窗裡顯示的網址（像 `http://192.168.x.x:8080/`）。第一次執行時 Windows 防火牆會問，請按「允許存取」。
注意：手機用這種網址（不是 https）時，瀏覽器會擋住相機和麥克風，所以拍照與錄語音要放到 GitHub Pages（https）上才測得到。

## 怎麼測試

1. **訪客・好多人**：選「訪客」→「好多人」→ 輸入名稱 → 進入。會有幾位示範住戶（小雲、麻糬、布丁…）不定時說話、進出。
2. **訪客・兩個人**：選「訪客」→「兩個人」→「第一次來？設定我的名字和數字」，設定名字、頭像、數字後開始聊天，縵會自動回幾句。
3. **縵**：回到選身分畫面，選「縵」。示範模式隨便輸入都能登入。要登入前，先把剛剛的訪客分頁留著，**另開一個分頁**，就能一邊當訪客、一邊當縵。
4. 悄悄話：在「兩個人」按標題列右邊的流星；按太陽結束（會先確認）。
5. 換主題：標題列的選單（⋯）→「換主題」。
6. 模擬斷線：選單裡已經沒有這個選項。要測的話，在瀏覽器按 F12 打開「Console」，輸入 `__ch3hw.service.setConnection({status:'offline'})` 斷線，`{status:'connected'}` 恢復。

完整的檢查項目在 `docs/architecture.md` 第 13.1 節。

## 放上 GitHub Pages

見 `docs/architecture.md` 第 12 章。簡單說：repo 設成公開，Settings → Pages → Deploy from a branch → `main` / `/ (root)`，約 1～2 分鐘後網址會是 `https://<帳號>.github.io/<repo 名稱>/`。所有檔案路徑都是相對路徑，放在子路徑下也能運作。

## 資料夾

| 資料夾 | 內容 |
|---|---|
| `index.html` | 唯一的網頁入口 |
| `css/` | 樣式（`theme-macaron.css`、`theme-night.css` 是兩個主題，`components.css` 是各個元件） |
| `js/` | 程式。`services/` 是通訊層（`mockService.js` 階段一、`supabaseService.js` 階段二），`ui/` 是各個畫面，`state/` 是目前的資料 |
| `assets/` | 小動物頭像（SVG）與圖示 |
| `design/` | 設計稿原始檔（不是網站的一部分） |
| `docs/` | 需求、架構、設計說明 |

## 階段二

只要新寫 `js/services/supabaseService.js`（照 `js/services/chatService.js` 的合約），再把 `js/config.js` 的 `backend` 改成 `supabase`。畫面不用動。金鑰只留在本機，永遠不進 git（見 `CLAUDE.md`）。
