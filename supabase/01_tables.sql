-- 01_tables.sql：資料表（只建立表格，規則在後面幾個檔案）
-- 在 Supabase 後台的 SQL Editor 貼上整份執行。可以重複執行，不會把已存在的資料弄壞。
-- 順序：01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09

create extension if not exists pgcrypto with schema extensions;

-- 房間：「好多人」是固定的一筆，每個一對一聊天室一筆
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group', 'dm')),
  created_at timestamptz not null default now()
);
insert into public.rooms (id, kind) values ('00000000-0000-4000-8000-000000000001', 'group')
  on conflict (id) do nothing;

-- 一對一聊天室的資料。code_hash 是代碼加密後的結果，不是明文
create table if not exists public.dm_rooms (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  visitor_name text not null,                 -- 縵看到的名字（可以改）
  visitor_name_normalized text not null,      -- 登入比對用（去空白、不分大小寫與全半形），不能改
  visitor_avatar text not null,               -- 縵看到的頭像（可以改）
  code_hash text not null,
  code_length int not null check (code_length in (4, 6)),
  visitor_cleared_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dm_rooms_name_idx on public.dm_rooms (visitor_name_normalized);

-- 誰能進哪個一對一聊天室（訪客的匿名身分）
create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  remembered boolean not null default false,
  unlocked_until timestamptz,
  device_label text,
  last_used_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
-- 一個匿名身分最多只能屬於一個一對一聊天室
create unique index if not exists room_members_one_room on public.room_members (user_id);

-- 站長清單：只會有一筆（only_one 固定是 true，所以第二筆放不進去）
create table if not exists public.site_owner (
  only_one boolean primary key default true check (only_one),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

-- 站長登入過的裝置（session_id 就是登入憑證裡的 session_id）
create table if not exists public.owner_devices (
  session_id uuid primary key,
  user_id uuid not null,
  label text,
  remembered boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- 縵對每個一對一聊天室的私人狀態（只有縵讀得到）
create table if not exists public.owner_room_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  blocked boolean not null default false,
  pinned boolean not null default false,
  muted boolean not null default false,
  last_read_at timestamptz
);

-- 縵的設定：兩個公開開關，以及縵在一對一對話裡顯示的名字與頭像
create table if not exists public.owner_settings (
  only_one boolean primary key default true check (only_one),
  show_online boolean not null default false,
  show_read boolean not null default false,
  owner_name text not null default '縵',
  owner_avatar text not null default 'mm'
);
insert into public.owner_settings (only_one) values (true) on conflict do nothing;

-- 輸入代碼的輸錯紀錄
create table if not exists public.resume_attempts (
  name_normalized text primary key,
  failed_count int not null default 0,
  locked_until timestamptz
);

-- 悄悄話分段（只有一對一聊天室有）
create table if not exists public.secret_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_seen_at timestamptz not null default now(),
  files_cleaned boolean not null default false
);
-- 同一個聊天室同一時間最多一個進行中的分段
create unique index if not exists secret_one_active on public.secret_sessions (room_id) where ended_at is null;

-- 訊息。media 放圖片、檔案、語音、影片的資訊（路徑、大小…），內容由前端決定格式
create table if not exists public.messages (
  id uuid primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  avatar text not null,
  content text,
  media jsonb,
  created_at timestamptz not null default now(),
  recalled boolean not null default false,
  segment_id uuid   -- 由資料庫自動填（悄悄話分段的編號），前端不能指定
);
create index if not exists messages_room_time on public.messages (room_id, created_at desc, id desc);
create index if not exists messages_user_time on public.messages (user_id, created_at desc);
create index if not exists messages_segment on public.messages (segment_id) where segment_id is not null;

-- 被收回訊息的原始內容備份（只有發送者讀得到）
create table if not exists public.message_archive (
  message_id uuid primary key references public.messages (id) on delete cascade,
  user_id uuid not null,
  content text,
  media jsonb
);

-- 表情回應：同一人、同一訊息只有一筆
create table if not exists public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  emoji text not null,
  nickname text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- 公告紀錄
create table if not exists public.announcements (
  room_id uuid not null references public.rooms (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  set_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, message_id)
);

-- 「刪除（只有我這邊）」：誰刪了什麼。purged = true 代表超過一天，不能再復原
create table if not exists public.hidden_items (
  user_id uuid not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  key text not null,
  hidden_at timestamptz not null default now(),
  purged boolean not null default false,
  primary key (user_id, room_id, key)
);
