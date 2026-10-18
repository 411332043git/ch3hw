# 階段二：Supabase 設定

這個資料夾的 SQL 腳本只是「設定說明書」，裡面沒有任何金鑰。

## 執行方式（在 Supabase 後台）

1. 左邊選單 **SQL Editor** → **New query**。
2. 依序把 `01_tables.sql` … `09_finish.sql` 的內容整份貼上，按右下角 **Run**，一份跑完再跑下一份。
3. 每份都應該顯示 **Success. No rows returned**（`09_finish.sql` 可能多顯示幾列工作編號，正常）。
4. 可以重複執行，不會把已存在的資料弄壞。

## 執行前要先做

- Authentication → Sign In / Providers：開啟 **Allow anonymous sign-ins**；Email 保持開啟，**Confirm email** 關閉。
- Database → Extensions：打開 **pg_cron**，確認 **pgcrypto** 已開。

## 這份腳本我怎麼測的

在本機用一個模擬的 PostgreSQL 把九份腳本全部跑過兩遍（確認可重複執行），再用 80 個情境檢查守門規則（冒充別人、直接改表、封鎖、代碼輸錯鎖定、悄悄話刪除、縵的裝置被忘記…）。模擬環境不是真正的 Supabase，所以真正執行時如果出現紅色錯誤，把錯誤文字貼給我。
