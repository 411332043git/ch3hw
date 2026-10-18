-- 05_secret.sql：悄悄話分段（只有一對一聊天室）
-- 開始、結束、保持在線、被丟下時自動結束。結束時，這一段的訊息會真的被刪掉。

-- 內部用：把一個分段結束並刪掉內容（end_secret 與定時清理共用）
create or replace function public._finish_secret(seg uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.reactions where message_id in (select id from public.messages where segment_id = seg);
  delete from public.message_archive where message_id in (select id from public.messages where segment_id = seg);
  delete from public.announcements where message_id in (select id from public.messages where segment_id = seg);
  delete from public.messages where segment_id = seg;
  update public.secret_sessions set ended_at = now() where id = seg and ended_at is null;
end $$;

-- 距離這個聊天室上一次切換（開始或結束）不到 5 秒就太快
create or replace function public._secret_cooldown_ok(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.secret_sessions
    where room_id = rid and greatest(started_at, coalesce(ended_at, started_at)) > now() - interval '5 seconds'
  )
$$;

create or replace function public.start_secret(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if p_room = public.group_room_id() or not exists (select 1 from public.rooms where id = p_room and kind = 'dm') then
    raise exception 'secret_not_allowed';
  end if;
  if not public.can_write_room(p_room) then raise exception 'cannot_send'; end if;
  if exists (select 1 from public.secret_sessions where room_id = p_room and ended_at is null) then
    raise exception 'secret_already_active';
  end if;
  if not public._secret_cooldown_ok(p_room) then raise exception 'secret_cooldown'; end if;
  insert into public.secret_sessions (room_id) values (p_room) returning * into s;
  return jsonb_build_object('id', s.id, 'roomId', s.room_id, 'startedAt', s.started_at);
end $$;

create or replace function public.end_secret(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare seg uuid;
begin
  if p_room = public.group_room_id() then raise exception 'secret_not_allowed'; end if;
  if not public.can_write_room(p_room) then raise exception 'cannot_send'; end if;
  select id into seg from public.secret_sessions where room_id = p_room and ended_at is null;
  if seg is null then raise exception 'secret_not_active'; end if;
  if not public._secret_cooldown_ok(p_room) then raise exception 'secret_cooldown'; end if;
  perform public._finish_secret(seg);
end $$;

-- 分段進行中，還在線的瀏覽器每約 30 秒呼叫一次
create or replace function public.touch_secret(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_room(p_room) then return; end if;
  update public.secret_sessions set last_seen_at = now() where room_id = p_room and ended_at is null;
end $$;

-- 瀏覽器清完這一段的圖片檔案後回報
create or replace function public.mark_secret_files_cleaned(p_segment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.secret_sessions set files_cleaned = true
  where id = p_segment and ended_at is not null and public.can_read_room(room_id);
end $$;

-- 對話雙方進入聊天室時：有哪些「已結束、圖片檔案還沒清」的分段
create or replace function public.secret_pending_cleanup(p_room uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.secret_sessions
  where room_id = p_room and ended_at is not null and not files_cleaned and public.can_read_room(p_room)
$$;

-- 定時：超過約 90 秒沒人更新的進行中分段，視為兩個人都離開了
create or replace function public._cron_secret_abandoned() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.secret_sessions where ended_at is null and last_seen_at < now() - interval '90 seconds' loop
    perform public._finish_secret(r.id);
  end loop;
end $$;
