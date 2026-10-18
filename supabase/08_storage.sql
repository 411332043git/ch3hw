-- 08_storage.sql：檔案空間（Storage）與規則
-- chat-images：訊息的圖片、語音、影片、檔案。公開讀取（網址含隨機編號，不知道網址的人找不到）
--   好多人：  <自己的 userId>/<檔名>
--   一對一：  dm/<房間編號>/<自己的 userId>/<檔名>
--   悄悄話：  dm/<房間編號>/secret/<分段編號>/<自己的 userId>/<檔名>
-- avatars：照片頭像，只能放進自己的資料夾，WebP 或 JPEG，最大約 200 KB

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('chat-images', 'chat-images', true, 52428800, array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf', 'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/vnd.rar',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]),
  ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ───────── chat-images ─────────
drop policy if exists chat_images_insert on storage.objects;
create policy chat_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[1] = 'dm'
        and public.can_write_room(public.safe_uuid((storage.foldername(name))[2]))
        and (
          (storage.foldername(name))[3] = auth.uid()::text
          or (
            (storage.foldername(name))[3] = 'secret'
            and (storage.foldername(name))[5] = auth.uid()::text
            and exists (
              select 1 from public.secret_sessions s
              where s.id = public.safe_uuid((storage.foldername(name))[4])
                and s.room_id = public.safe_uuid((storage.foldername(name))[2])
                and s.ended_at is null
            )
          )
        )
      )
    )
  );

-- 列出檔案（清理悄悄話、刪除對話時需要）：只看得到自己有權限的聊天室
drop policy if exists chat_images_select on storage.objects;
create policy chat_images_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or ((storage.foldername(name))[1] = 'dm'
          and (public.is_owner() or public.dm_access(public.safe_uuid((storage.foldername(name))[2]))))
    )
  );

-- 刪除：
--  1. 縵可以刪 dm/ 底下任何檔案（刪除整個對話）
--  2. 悄悄話分段「已結束」之後，聊天室的成員可以刪那一段的檔案
--  3. 發送者可以刪「設為公告的訊息」裡自己的檔案（公告的圖片不會自動過期，只能手動刪）
-- 一般聊天的檔案不能手動刪，只靠自動過期
drop policy if exists chat_images_delete on storage.objects;
create policy chat_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images' and (
      ((storage.foldername(name))[1] = 'dm' and public.is_owner())
      or (
        (storage.foldername(name))[1] = 'dm' and (storage.foldername(name))[3] = 'secret'
        and public.can_read_room(public.safe_uuid((storage.foldername(name))[2]))
        and exists (
          select 1 from public.secret_sessions s
          where s.id = public.safe_uuid((storage.foldername(name))[4]) and s.ended_at is not null
        )
      )
      or exists (
        select 1 from public.messages m join public.announcements a on a.message_id = m.id
        where m.user_id = auth.uid() and position(name in m.media::text) > 0
      )
    )
  );

-- ───────── avatars ─────────
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
