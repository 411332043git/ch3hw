-- 03_policies.sql：RLS 守門規則（誰能讀、誰能寫哪幾列）
-- 做法：先把所有人的權限收光，再一項一項只開放需要的。
-- 所有「寫入」幾乎都只能透過函式（04 之後的檔案），前端不能直接改表。

-- 縵看到訪客「清空我這邊畫面」的時間用的小工具
create or replace function public.cleared_at(rid uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce(visitor_cleared_at, '-infinity') from public.dm_rooms where room_id = rid
$$;

-- 1. 收光
revoke all on all tables in schema public from anon, authenticated;

-- 2. 全部表格開啟 RLS（沒有規則 = 完全不能碰）
alter table public.rooms enable row level security;
alter table public.dm_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.site_owner enable row level security;
alter table public.owner_devices enable row level security;
alter table public.owner_room_state enable row level security;
alter table public.owner_settings enable row level security;
alter table public.resume_attempts enable row level security;
alter table public.secret_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.message_archive enable row level security;
alter table public.reactions enable row level security;
alter table public.announcements enable row level security;
alter table public.hidden_items enable row level security;

-- 3. 開放讀取（只開需要的欄位）
grant select on public.rooms to authenticated;
grant select (room_id, visitor_name, visitor_avatar, visitor_cleared_at, last_message_at, created_at) on public.dm_rooms to authenticated;
grant select on public.room_members, public.owner_devices, public.owner_room_state, public.owner_settings,
  public.secret_sessions, public.messages, public.message_archive, public.reactions, public.announcements,
  public.hidden_items to authenticated;
-- site_owner、resume_attempts：連讀都不開放，只有函式能用
grant insert on public.messages to authenticated;

-- 4. 規則
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated
  using (public.can_read_room(id));

drop policy if exists dm_rooms_select on public.dm_rooms;
create policy dm_rooms_select on public.dm_rooms for select to authenticated
  using (public.is_owner() or public.dm_access(room_id));

drop policy if exists members_select on public.room_members;
create policy members_select on public.room_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists owner_devices_select on public.owner_devices;
create policy owner_devices_select on public.owner_devices for select to authenticated
  using (public.is_owner());

drop policy if exists owner_room_state_select on public.owner_room_state;
create policy owner_room_state_select on public.owner_room_state for select to authenticated
  using (public.is_owner());

drop policy if exists owner_settings_select on public.owner_settings;
create policy owner_settings_select on public.owner_settings for select to authenticated
  using (public.is_owner());

drop policy if exists secret_select on public.secret_sessions;
create policy secret_select on public.secret_sessions for select to authenticated
  using (room_id <> public.group_room_id() and public.can_read_room(room_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    (room_id = public.group_room_id() and auth.uid() is not null)
    or public.is_owner()
    or (public.dm_access(room_id) and created_at > public.cleared_at(room_id))
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.can_write_room(room_id));

drop policy if exists archive_select on public.message_archive;
create policy archive_select on public.message_archive for select to authenticated
  using (user_id = auth.uid());

drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_read_room(room_id));

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (public.can_read_room(room_id));

drop policy if exists hidden_select on public.hidden_items;
create policy hidden_select on public.hidden_items for select to authenticated
  using (user_id = auth.uid());
