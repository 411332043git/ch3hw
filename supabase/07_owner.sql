-- 07_owner.sql：站長（縵）專用：第一次建立、裝置、對話管理、公開開關
-- 「是不是站長」永遠由 site_owner 清單決定，不是看誰有帳號。

-- 第一次建立站長：網站用 Email＋密碼註冊後，立刻呼叫。只有 site_owner 還是空的才會成功
create or replace function public.claim_owner() returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'claim_closed';
  end if;
  insert into public.site_owner (user_id) values (auth.uid()) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'claim_closed'; end if;
end $$;

-- 這個人是站長清單上的人（還沒登記裝置時用，不看裝置有沒有被忘記）
create or replace function public._is_owner_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.site_owner so where so.user_id = auth.uid())
$$;

-- 登入後登記這台裝置。回傳這台裝置現在是不是還有效
create or replace function public.register_owner_device(p_label text, p_remember boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid := public.safe_uuid(auth.jwt() ->> 'session_id'); d record;
begin
  if not public._is_owner_user() or sid is null then raise exception 'login_failed'; end if;
  select * into d from public.owner_devices where session_id = sid;
  if found and d.revoked_at is not null then raise exception 'device_revoked'; end if;
  insert into public.owner_devices (session_id, user_id, label, remembered)
    values (sid, auth.uid(), left(p_label, 60), coalesce(p_remember, false))
    on conflict (session_id) do update
      set last_used_at = now(), remembered = coalesce(p_remember, public.owner_devices.remembered);
  return true;
end $$;

-- 每次打開網頁時呼叫：更新最後使用時間，回傳這台裝置還有沒有站長權限
create or replace function public.owner_device_ok() returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid := public.safe_uuid(auth.jwt() ->> 'session_id');
begin
  if not public.is_owner() then return false; end if;
  update public.owner_devices set last_used_at = now() where session_id = sid;
  return true;
end $$;

create or replace function public.set_remember_this_device(p_remember boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  update public.owner_devices set remembered = coalesce(p_remember, false)
    where session_id = public.safe_uuid(auth.jwt() ->> 'session_id');
end $$;

-- 忘記某個裝置：立刻失去站長權限，登入憑證也一併作廢
create or replace function public.forget_device(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  update public.owner_devices set revoked_at = now(), remembered = false
    where session_id = p_session and user_id = auth.uid() and revoked_at is null;
  begin delete from auth.sessions where id = p_session and user_id = auth.uid(); exception when others then null; end;
end $$;

create or replace function public.sign_out_other_devices() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.safe_uuid(auth.jwt() ->> 'session_id');
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  update public.owner_devices set revoked_at = now(), remembered = false
    where user_id = auth.uid() and session_id <> me and revoked_at is null;
  begin delete from auth.sessions where user_id = auth.uid() and id <> me; exception when others then null; end;
end $$;

-- 登出這台：標記忘記，作廢憑證
create or replace function public.owner_sign_out_this_device() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := public.safe_uuid(auth.jwt() ->> 'session_id');
begin
  update public.owner_devices set revoked_at = now(), remembered = false
    where session_id = me and user_id = auth.uid() and revoked_at is null;
end $$;

-- ───────── 對話列表與管理 ─────────

-- 縵的對話摘要列表：預覽、未讀數、封鎖、置頂、靜音。悄悄話只顯示「🫧 悄悄話」，不顯示內容
create or replace function public.list_dms() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.blocked, not t.pinned, t."lastMessageAt" desc nulls last)
    from (
      select d.room_id as "roomId", d.visitor_name as "visitorName", d.visitor_avatar as "visitorAvatar",
             s.blocked, s.pinned, s.muted,
             coalesce(lm.created_at, d.created_at) as "lastMessageAt",
             case when lm.id is null then null
                  when lm.segment_id is not null then '🫧 悄悄話'
                  when lm.recalled then '訊息已收回'
                  when lm.content is not null then left(lm.content, 40)
                  else '📷 圖片或檔案' end as "lastMessagePreview",
             (select count(*) from public.messages m
               where m.room_id = d.room_id and m.user_id <> me
                 and m.created_at > coalesce(s.last_read_at, '-infinity'))::int as "unreadCount"
      from public.dm_rooms d
      join public.owner_room_state s on s.room_id = d.room_id
      left join lateral (
        select m.* from public.messages m where m.room_id = d.room_id order by m.created_at desc, m.id desc limit 1
      ) lm on true
    ) t
  ), '[]'::jsonb);
end $$;

create or replace function public.mark_read(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  update public.owner_room_state set last_read_at = now() where room_id = p_room;
end $$;

create or replace function public.set_dm_flag(p_room uuid, p_flag text, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  if p_flag = 'blocked' then update public.owner_room_state set blocked = p_value where room_id = p_room;
  elsif p_flag = 'pinned' then update public.owner_room_state set pinned = p_value where room_id = p_room;
  elsif p_flag = 'muted' then update public.owner_room_state set muted = p_value where room_id = p_room;
  else raise exception 'message_invalid';
  end if;
end $$;

-- 刪除整個對話：訊息、表情、備份、分段、成員、代碼全部真的刪掉（Storage 的檔案由縵的瀏覽器接著刪）
create or replace function public.delete_dm(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  delete from public.rooms where id = p_room and kind = 'dm';
end $$;

-- 兩個公開開關
create or replace function public.set_owner_privacy(p_show_online boolean, p_show_read boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  update public.owner_settings set show_online = coalesce(p_show_online, false), show_read = coalesce(p_show_read, false);
end $$;

-- 縵在一對一對話裡顯示的名字與頭像（頭像可以選蝴蝶結小兔子 mm）
create or replace function public.update_owner_profile(p_name text, p_avatar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  if not public.valid_name(p_name, true) then raise exception 'nickname_invalid'; end if;
  if not public.valid_avatar(p_avatar, true) then raise exception 'avatar_invalid'; end if;
  update public.owner_settings set owner_name = p_name, owner_avatar = p_avatar;
  return jsonb_build_object('name', p_name, 'avatar', p_avatar);
end $$;
