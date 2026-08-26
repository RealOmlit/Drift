-- ============================================================================
-- Drift · image support (run AFTER supabase-setup.sql, once)
--   1) avatar_url column on profiles
--   2) public Storage buckets: 'avatars' + 'chat-images'
--   3) policies: signed-in users upload only into their own folder
--
-- Paste the whole file into Supabase → SQL Editor → Run.
-- ============================================================================

alter table public.profiles add column if not exists avatar_url text;

-- ----------------------------------------------------------------- buckets --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images', 'chat-images', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
) on conflict (id) do nothing;

-- ---------------------------------------------------------------- policies --
drop policy if exists "avatars read"        on storage.objects;
drop policy if exists "avatars own insert"  on storage.objects;
drop policy if exists "avatars own update"  on storage.objects;
drop policy if exists "chat images read"    on storage.objects;
drop policy if exists "chat images insert"  on storage.objects;

create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "chat images read" on storage.objects
  for select using (bucket_id = 'chat-images');

create policy "chat images insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = auth.uid()::text);
