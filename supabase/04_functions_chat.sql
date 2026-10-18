-- 04_functions_chat.sql：收回、復原、表情回應、公告、「只刪我這邊」、刪除自己的檔案
-- 這些函式是前端能改訊息的唯一入口，每一個都會檢查「你是不是這個人／有沒有權限」。

-- 收回：內容搬到備份，訊息本體清空
create or replace function public.recall_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select * into m from public.messages where id = p_id for update;
  if not found or m.user_id <> auth.uid() then raise exception 'not_owner'; end if;
  if not public.can_read_room(m.room_id) then raise exception 'cannot_send'; end if;
  if m.recalled then return; end if;
  insert into public.message_archive (message_id, user_id, content, media)
    values (m.id, m.user_id, m.content, m.media)
    on conflict (message_id) do update set content = excluded.content, media = excluded.media;
  perform set_config('app.allow_msg_update', '1', true);
  update public.messages set content = null, media = null, recalled = true where id = p_id;
end $$;

-- 復原：內容從備份搬回來（沒有時間限制）
create or replace function public.restore_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record; a record;
begin
  select * into m from public.messages where id = p_id for update;
  if not found or m.user_id <> auth.uid() then raise exception 'not_owner'; end if;
  if not public.can_read_room(m.room_id) then raise exception 'cannot_send'; end if;
  if not m.recalled then return; end if;
  select * into a from public.message_archive where message_id = p_id;
  if not found then raise exception 'not_owner'; end if;
  perform set_config('app.allow_msg_update', '1', true);
  update public.messages set content = a.content, media = a.media, recalled = false where id = p_id;
  delete from public.message_archive where message_id = p_id;
end $$;

-- 表情回應：沒按過就加、按同一個就取消、按不同的就改選。回傳 added / removed / changed
create or replace function public.toggle_reaction(p_message uuid, p_emoji text, p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare m record; r record; recent int;
begin
  if auth.uid() is null then raise exception 'cannot_send'; end if;
  if not public.valid_emoji(p_emoji) then raise exception 'message_invalid'; end if;
  if not public.valid_name(p_nickname, public.is_owner()) then raise exception 'nickname_invalid'; end if;
  select id, room_id, recalled into m from public.messages where id = p_message;
  if not found or m.recalled or not public.can_read_room(m.room_id) then raise exception 'cannot_send'; end if;

  select count(*) into recent from public.reactions where user_id = auth.uid() and created_at > now() - interval '10 seconds';
  if recent >= 20 then raise exception 'rate_limited'; end if;

  select * into r from public.reactions where message_id = p_message and user_id = auth.uid();
  if not found then
    insert into public.reactions (message_id, user_id, room_id, emoji, nickname)
      values (p_message, auth.uid(), m.room_id, p_emoji, p_nickname);
    return 'added';
  elsif r.emoji = p_emoji then
    delete from public.reactions where message_id = p_message and user_id = auth.uid();
    return 'removed';
  else
    update public.reactions set emoji = p_emoji, nickname = p_nickname, created_at = now()
      where message_id = p_message and user_id = auth.uid();
    return 'changed';
  end if;
end $$;

-- 公告
create or replace function public.set_announcement(p_room uuid, p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_write_room(p_room) then raise exception 'cannot_send'; end if;
  if not exists (select 1 from public.messages where id = p_message and room_id = p_room and not recalled) then
    raise exception 'message_invalid';
  end if;
  insert into public.announcements (room_id, message_id, set_by) values (p_room, p_message, auth.uid())
    on conflict do nothing;
end $$;

-- 刪除公告紀錄：設定的人或縵可以刪（訊息本身還在）
create or replace function public.remove_announcement(p_room uuid, p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.announcements
    where room_id = p_room and message_id = p_message and (set_by = auth.uid() or public.is_owner());
end $$;

-- 「刪除（只有我這邊）」：復原、直接刪除。key 是訊息編號，或 seg:分段編號
create or replace function public.hide_item(p_room uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_room(p_room) or char_length(p_key) > 80 then raise exception 'cannot_send'; end if;
  insert into public.hidden_items (user_id, room_id, key) values (auth.uid(), p_room, p_key)
    on conflict (user_id, room_id, key) do update set hidden_at = now(), purged = false;
end $$;

create or replace function public.unhide_item(p_room uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.hidden_items where user_id = auth.uid() and room_id = p_room and key = p_key and not purged;
end $$;

create or replace function public.purge_item(p_room uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.hidden_items set purged = true where user_id = auth.uid() and room_id = p_room and key = p_key;
end $$;

-- 手動刪除自己訊息裡的圖片、影片、語音或檔案（縵也可以刪）。回傳被拿掉的部分，前端再去刪 Storage 的檔案
-- p_kind：images（要再給 p_ref＝這張圖片的路徑）、file、voice、video
create or replace function public.delete_media(p_message uuid, p_kind text, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m record; removed jsonb; kept jsonb;
begin
  select * into m from public.messages where id = p_message for update;
  if not found or not (m.user_id = auth.uid() or public.is_owner()) then raise exception 'not_owner'; end if;
  if not public.can_read_room(m.room_id) then raise exception 'cannot_send'; end if;
  if m.media is null then return '[]'::jsonb; end if;
  perform set_config('app.allow_msg_update', '1', true);
  if p_kind = 'images' then
    select coalesce(jsonb_agg(x) filter (where x ->> 'path' = p_ref), '[]'::jsonb),
           coalesce(jsonb_agg(x) filter (where x ->> 'path' is distinct from p_ref), '[]'::jsonb)
      into removed, kept from jsonb_array_elements(coalesce(m.media -> 'images', '[]'::jsonb)) x;
    update public.messages set media = case when jsonb_array_length(kept) = 0 then media - 'images'
                                            else jsonb_set(media, '{images}', kept) end where id = p_message;
    return removed;
  elsif p_kind in ('file', 'voice', 'video') then
    removed := jsonb_build_array(m.media -> p_kind);
    update public.messages set media = media - p_kind where id = p_message;
    return removed;
  end if;
  raise exception 'message_invalid';
end $$;

-- 給定時敲門用（9.4）：任何人都可以呼叫，什麼資料都不回
create or replace function public.ping() returns int
language sql stable set search_path = '' as $$ select 1 $$;
