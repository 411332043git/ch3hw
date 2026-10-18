-- 06_dm_access.sql：訪客開啟、接回「兩個人」聊天室
-- 代碼用 bcrypt 加密後才存。輸錯 5 次鎖住這個名字 15 分鐘。
-- unlock_dm 輸錯時「回傳」錯誤而不是丟出錯誤，這樣輸錯的次數才會真的記下來。

create or replace function public.create_dm(p_name text, p_avatar text, p_code text, p_remember boolean, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nn text; rid uuid; r record;
begin
  if auth.uid() is null or public.is_owner() then raise exception 'cannot_send'; end if;
  if exists (select 1 from public.room_members where user_id = auth.uid()) then raise exception 'dm_exists'; end if;
  if not public.valid_name(p_name) then raise exception 'nickname_invalid'; end if;
  if not public.valid_avatar(p_avatar) then raise exception 'avatar_invalid'; end if;
  if p_code is null or p_code !~ '^(\d{4}|\d{6})$' then raise exception 'code_wrong'; end if;
  nn := public.normalize_name(p_name);
  -- 名字加代碼這組不能已經有人用
  for r in select code_hash from public.dm_rooms where visitor_name_normalized = nn loop
    if extensions.crypt(p_code, r.code_hash) = r.code_hash then raise exception 'name_code_taken'; end if;
  end loop;
  insert into public.rooms (kind) values ('dm') returning id into rid;
  insert into public.dm_rooms (room_id, visitor_name, visitor_name_normalized, visitor_avatar, code_hash, code_length)
    values (rid, p_name, nn, p_avatar, extensions.crypt(p_code, extensions.gen_salt('bf')), char_length(p_code));
  insert into public.room_members (room_id, user_id, remembered, unlocked_until, device_label)
    values (rid, auth.uid(), coalesce(p_remember, false), now() + interval '30 minutes', left(p_label, 60));
  insert into public.owner_room_state (room_id) values (rid);
  return jsonb_build_object('roomId', rid, 'name', p_name, 'avatar', p_avatar, 'codeLength', char_length(p_code));
end $$;

create or replace function public.unlock_dm(p_name text, p_code text, p_remember boolean, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nn text; att record; r record; hit uuid; cnt int; res jsonb; had boolean;
begin
  if auth.uid() is null or public.is_owner() then raise exception 'cannot_send'; end if;
  nn := left(public.normalize_name(coalesce(p_name, '')), 60);
  if nn = '' or p_code is null or p_code !~ '^(\d{4}|\d{6})$' then
    return jsonb_build_object('error', 'code_wrong');
  end if;
  select * into att from public.resume_attempts where name_normalized = nn;
  had := found;
  if had and att.locked_until is not null and att.locked_until > now() then
    return jsonb_build_object('error', 'code_locked');
  end if;

  for r in select room_id, code_hash from public.dm_rooms where visitor_name_normalized = nn loop
    if extensions.crypt(p_code, r.code_hash) = r.code_hash then hit := r.room_id; exit; end if;
  end loop;

  if hit is null then
    cnt := case when had then att.failed_count else 0 end + 1;
    insert into public.resume_attempts (name_normalized, failed_count, locked_until)
      values (nn, case when cnt >= 5 then 0 else cnt end, case when cnt >= 5 then now() + interval '15 minutes' end)
      on conflict (name_normalized) do update
        set failed_count = excluded.failed_count, locked_until = excluded.locked_until;
    -- 同樣的回應，不透露是名字不存在還是代碼錯
    return jsonb_build_object('error', case when cnt >= 5 then 'code_locked' else 'code_wrong' end);
  end if;

  delete from public.resume_attempts where name_normalized = nn;
  delete from public.room_members where user_id = auth.uid() and room_id <> hit;
  insert into public.room_members (room_id, user_id, remembered, unlocked_until, device_label, last_used_at)
    values (hit, auth.uid(), coalesce(p_remember, false), now() + interval '30 minutes', left(p_label, 60), now())
    on conflict (room_id, user_id) do update
      set remembered = excluded.remembered, unlocked_until = excluded.unlocked_until,
          device_label = excluded.device_label, last_used_at = now();
  select jsonb_build_object('roomId', d.room_id, 'name', d.visitor_name, 'avatar', d.visitor_avatar, 'codeLength', d.code_length)
    into res from public.dm_rooms d where d.room_id = hit;
  return res;
end $$;

-- 這個瀏覽器的「兩個人」狀態：有沒有聊天室、是否被記得、目前解鎖了沒
create or replace function public.get_dm_session() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r record;
begin
  select d.room_id, d.visitor_name, d.visitor_avatar, d.code_length, m.remembered,
         (m.remembered or coalesce(m.unlocked_until, '-infinity') > now()) as unlocked
    into r
    from public.room_members m join public.dm_rooms d on d.room_id = m.room_id
    where m.user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('roomId', r.room_id, 'name', r.visitor_name, 'avatar', r.visitor_avatar,
                            'codeLength', r.code_length, 'remembered', r.remembered, 'unlocked', r.unlocked);
end $$;

create or replace function public.set_dm_remember(p_room uuid, p_remember boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_access(p_room) then raise exception 'cannot_send'; end if;
  update public.room_members set remembered = coalesce(p_remember, false), last_used_at = now()
    where room_id = p_room and user_id = auth.uid();
end $$;

create or replace function public.forget_my_devices(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_access(p_room) then raise exception 'cannot_send'; end if;
  update public.room_members set remembered = false where room_id = p_room;
end $$;

-- 對話開著時，約每 5 分鐘呼叫一次，延長解鎖
create or replace function public.touch_dm(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_access(p_room) then return; end if;
  update public.room_members set unlocked_until = now() + interval '30 minutes', last_used_at = now()
    where room_id = p_room and user_id = auth.uid();
end $$;

create or replace function public.clear_my_view(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_access(p_room) then raise exception 'cannot_send'; end if;
  update public.dm_rooms set visitor_cleared_at = now() where room_id = p_room;
end $$;

-- 訪客換「兩個人」的暱稱與頭像（只改縵看到的；登入用的名字和代碼不變）
create or replace function public.update_dm_profile(p_room uuid, p_name text, p_avatar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.dm_access(p_room) then raise exception 'cannot_send'; end if;
  if not public.valid_name(p_name) then raise exception 'nickname_invalid'; end if;
  if not public.valid_avatar(p_avatar) then raise exception 'avatar_invalid'; end if;
  update public.dm_rooms set visitor_name = p_name, visitor_avatar = p_avatar where room_id = p_room;
  return jsonb_build_object('name', p_name, 'avatar', p_avatar);
end $$;

-- 縵在一對一對話裡顯示的名字與頭像（所有登入的人都能看）
create or replace function public.get_owner_profile() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', owner_name, 'avatar', owner_avatar) from public.owner_settings where auth.uid() is not null
$$;

-- 縵公開了「已讀」時，這個聊天室的成員才拿得到縵看到哪裡
create or replace function public.get_owner_read_at(p_room uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select s.last_read_at
  from public.owner_room_state s, public.owner_settings o
  where s.room_id = p_room and o.show_read and public.dm_access(p_room)
$$;

-- 縵公開了「在線」時為 true（訪客用來決定要不要去聽縵的在線頻道）
create or replace function public.get_owner_online_visible() returns boolean
language sql stable security definer set search_path = '' as $$
  select show_online from public.owner_settings where auth.uid() is not null
$$;
