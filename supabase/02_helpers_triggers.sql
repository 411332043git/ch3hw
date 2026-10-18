-- 02_helpers_triggers.sql：小工具函式，以及「寫入前自動檢查」（trigger）
-- 錯誤一律用「代碼」當訊息（例如 rate_limited），前端會把代碼翻成中文。

-- 把字串轉成可安全轉成 uuid 的值，不合格回傳 null
create or replace function public.safe_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- 名字合格嗎：1～20 個字、前後不能有空白、不能連續兩個空白、不能有控制字元或 ASCII 符號
create or replace function public.valid_name(n text, allow_reserved boolean default false) returns boolean
language sql immutable set search_path = '' as $$
  select n is not null
    and char_length(n) between 1 and 20
    and n = btrim(n)
    and n !~ '  '
    and n !~ '[\x00-\x1f\x7f]'
    and n !~ '[!-/:-@\[-`{-~]'
    and (allow_reserved or lower(n) <> all (array['系統', 'admin', 'administrator', '縵', 'mm', 'system', '管理員']))
$$;

create or replace function public.normalize_name(n text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(normalize(n, nfkc), '\s+', '', 'g'))
$$;

-- 內建頭像代號，或我們自己 Storage 頭像資料夾的網址
create or replace function public.valid_avatar(a text, allow_mm boolean default false) returns boolean
language sql immutable set search_path = '' as $$
  select a is not null and (
    a = any (array['crab','duck','chick','polarbear','cat','shark','rabbit','koala','elephant','dog','pig','fish',
                   'unicorn','giraffe','tiger','whale','bear','monkey','hamster','frog'])
    or (allow_mm and a = 'mm')
    or (char_length(a) <= 300 and a ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[A-Za-z0-9._/-]+$')
  )
$$;

-- 看起來像一個 emoji：很短，不含英文字母、數字、空白或 < > 這類符號
create or replace function public.valid_emoji(e text) returns boolean
language sql immutable set search_path = '' as $$
  select e is not null and char_length(e) between 1 and 16
    and e !~ '[A-Za-z0-9[:space:]<>&"''`\\]'
$$;

-- 這次登入是不是站長：在站長清單、不是匿名、而且這台裝置沒有被忘記
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.site_owner so where so.user_id = auth.uid())
    and not exists (
      select 1 from public.owner_devices d
      where d.session_id = public.safe_uuid(auth.jwt() ->> 'session_id') and d.revoked_at is not null
    )
$$;

create or replace function public.group_room_id() returns uuid
language sql immutable set search_path = '' as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;

-- 這個人是不是這個一對一聊天室的成員，而且（被記得 或 目前解鎖中）
create or replace function public.dm_access(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = rid and m.user_id = auth.uid()
      and (m.remembered or coalesce(m.unlocked_until, '-infinity') > now())
  )
$$;

-- 讀得到這個房間嗎（好多人：所有登入的人；一對一：縵，或解鎖中的成員）
create or replace function public.can_read_room(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    rid = public.group_room_id()
    or public.is_owner()
    or public.dm_access(rid)
  )
$$;

create or replace function public.can_write_room(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_room(rid)
$$;

-- ───────── 訊息寫入前的檢查 ─────────
create or replace function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last_at timestamptz;
  seg uuid;
  is_dm boolean;
  n_images int;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;
  select (kind = 'dm') into is_dm from public.rooms where id = new.room_id;
  if is_dm is null then raise exception 'cannot_send'; end if;

  -- 被封鎖、或聊天室不存在，一律回 cannot_send（不透露原因）
  if is_dm and not public.is_owner() then
    if exists (select 1 from public.owner_room_state s where s.room_id = new.room_id and s.blocked) then
      raise exception 'cannot_send';
    end if;
  end if;

  if not public.valid_name(new.nickname, public.is_owner()) then raise exception 'nickname_invalid'; end if;
  if not public.valid_avatar(new.avatar, public.is_owner()) then raise exception 'avatar_invalid'; end if;

  new.recalled := false;
  new.created_at := now();
  if new.content is not null and new.content = '' then new.content := null; end if;
  if char_length(coalesce(new.content, '')) > 2000 then raise exception 'message_invalid'; end if;
  if new.content is null and (new.media is null or new.media = '{}'::jsonb) then raise exception 'message_invalid'; end if;
  if new.media is not null then
    if jsonb_typeof(new.media) <> 'object' then raise exception 'message_invalid'; end if;
    if jsonb_typeof(new.media -> 'images') = 'array' then
      n_images := jsonb_array_length(new.media -> 'images');
      if n_images > 10 then raise exception 'too_many_images'; end if;
    end if;
    if pg_column_size(new.media) > 20000 then raise exception 'message_invalid'; end if;
  end if;

  -- 同一個人兩則訊息之間至少 0.5 秒
  select max(created_at) into last_at from public.messages where user_id = new.user_id;
  if last_at is not null and now() - last_at < interval '0.5 seconds' then
    raise exception 'rate_limited';
  end if;

  -- 悄悄話：有進行中的分段就自動歸進去（前端不能自己指定）
  new.segment_id := null;
  if is_dm then
    select id into seg from public.secret_sessions where room_id = new.room_id and ended_at is null;
    new.segment_id := seg;
  end if;
  return new;
end $$;

drop trigger if exists messages_bi on public.messages;
create trigger messages_bi before insert on public.messages
  for each row execute function public.messages_before_insert();

-- 訊息寫進一對一聊天室後，更新「最後一則訊息的時間」（悄悄話不算）
create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.segment_id is null then
    update public.dm_rooms set last_message_at = new.created_at where room_id = new.room_id;
  end if;
  return new;
end $$;

drop trigger if exists messages_ai on public.messages;
create trigger messages_ai after insert on public.messages
  for each row execute function public.messages_after_insert();

-- 前端不能直接改訊息（收回、復原只能走函式；函式會設定一個旗標讓這個檢查放行）
create or replace function public.messages_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.allow_msg_update', true), '') <> '1' then
    raise exception 'not_owner';
  end if;
  return new;
end $$;

drop trigger if exists messages_bu on public.messages;
create trigger messages_bu before update on public.messages
  for each row execute function public.messages_before_update();
