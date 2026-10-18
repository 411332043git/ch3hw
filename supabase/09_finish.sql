-- 09_finish.sql：最後收尾：函式的使用權限、定時工作（pg_cron）、即時推播（Realtime）
-- 需要先在後台 Database → Extensions 打開 pg_cron。

-- ───────── 函式的使用權限 ─────────
-- 先全部收光，再只開放前端要呼叫的。名字開頭是底線（_）的是內部用，不開放。
revoke execute on all functions in schema public from public, anon, authenticated;

-- 規則裡會用到的小工具（RLS 與 Storage 規則是用呼叫者的身分執行，所以要開放）
grant execute on function
  public.is_owner(), public.dm_access(uuid), public.can_read_room(uuid), public.can_write_room(uuid),
  public.cleared_at(uuid), public.group_room_id(), public.safe_uuid(text)
  to authenticated;

-- 前端可以呼叫的函式
grant execute on function
  public.recall_message(uuid), public.restore_message(uuid), public.toggle_reaction(uuid, text, text),
  public.set_announcement(uuid, uuid), public.remove_announcement(uuid, uuid),
  public.hide_item(uuid, text), public.unhide_item(uuid, text), public.purge_item(uuid, text),
  public.delete_media(uuid, text, text),
  public.start_secret(uuid), public.end_secret(uuid), public.touch_secret(uuid),
  public.mark_secret_files_cleaned(uuid), public.secret_pending_cleanup(uuid),
  public.create_dm(text, text, text, boolean, text), public.unlock_dm(text, text, boolean, text),
  public.get_dm_session(), public.set_dm_remember(uuid, boolean), public.forget_my_devices(uuid),
  public.touch_dm(uuid), public.clear_my_view(uuid), public.update_dm_profile(uuid, text, text),
  public.get_owner_profile(), public.get_owner_read_at(uuid), public.get_owner_online_visible(),
  public.claim_owner(), public.register_owner_device(text, boolean), public.owner_device_ok(),
  public.set_remember_this_device(boolean), public.forget_device(uuid), public.sign_out_other_devices(),
  public.owner_sign_out_this_device(), public.list_dms(), public.mark_read(uuid),
  public.set_dm_flag(uuid, text, boolean), public.delete_dm(uuid), public.set_owner_privacy(boolean, boolean),
  public.update_owner_profile(text, text)
  to authenticated;

-- 定時敲門用：不用登入也能呼叫，什麼資料都不回
grant execute on function public.ping() to anon, authenticated;

-- ───────── 定時工作 ─────────
-- 每分鐘：被丟下超過約 90 秒的悄悄話分段，自動結束並刪除
select cron.schedule('secret-abandoned', '* * * * *', $$select public._cron_secret_abandoned()$$);

-- 每小時：「只刪我這邊」超過 1 天的，變成不能再復原
select cron.schedule('hidden-purge', '7 * * * *',
  $$update public.hidden_items set purged = true where not purged and hidden_at < now() - interval '1 day'$$);

-- 每天：超過 30 天沒使用的「記得此裝置」，自動忘記（訪客與縵）
select cron.schedule('forget-old-devices', '17 3 * * *', $$
  update public.room_members set remembered = false where remembered and last_used_at < now() - interval '30 days';
  update public.owner_devices set remembered = false, revoked_at = now()
    where remembered and revoked_at is null and last_used_at < now() - interval '30 days';
$$);

-- ───────── 即時推播（Realtime） ─────────
-- 這些表有變動時，會即時通知有權限讀的人（RLS 照樣生效）
-- hidden_items 故意不放進來：刪除事件不受 RLS 過濾，會把別人刪了什麼洩漏出去
do $$
declare t text;
begin
  foreach t in array array['messages', 'reactions', 'secret_sessions', 'announcements']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 如果之前跑過舊版（有 hidden_items），把它從推播拿掉
do $$ begin
  begin alter publication supabase_realtime drop table public.hidden_items; exception when others then null; end;
end $$;
