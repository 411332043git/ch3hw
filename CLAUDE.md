# CLAUDE.md

可愛馬卡龍風格的即時聊天室：訪客用「好多人」匿名群組和「兩個人」一對一聊天室，縵（站長）登入後管理所有對話。前端放 GitHub Pages，即時傳訊用 Supabase。

## 開始任何工作前

先讀 `docs/architecture.md`（架構、規則、畫面、驗證清單都在裡面）。需求原文在 `docs/requirements.md`。

做畫面、樣式時，再讀 `docs/design.md`（顏色、元件、互動、畫面清單）；設計稿原始檔在 `design/`。

## 目前階段

**階段一**：只做前端，使用 `mockService`（示範模式），不接 Supabase。階段二才接 Supabase。

## 金鑰

金鑰檔案只留在本機，由 `.gitignore` 擋住，永遠不進 git。能進 repo 的只有 Project URL 和 Publishable key。
