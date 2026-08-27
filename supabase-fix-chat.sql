-- ============================================================================
-- Drift · hotfix for chat broken by missing 'image' type (run once)
-- If chat shows "Couldn’t send message" or image sends always fail with
-- check-constraint errors, run this in Supabase → SQL Editor → Run.
-- Afterwards, also run supabase-setup-images.sql if you never did (for buckets).
-- ============================================================================

-- Allow image messages (was missing in releases before v2.2.4)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'messages_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'messages_type_check'
        and pg_get_constraintdef(oid) like '%''image''%'
    ) then
      alter table public.messages drop constraint messages_type_check;
      alter table public.messages
        add constraint messages_type_check check (type in ('text','system','activity','poll','image'));
      raise notice 'messages_type_check patched to allow image';
    else
      raise notice 'messages_type_check already allows image';
    end if;
  else
    -- Fallback: table exists without named constraint (unlikely) — add it
    begin
      alter table public.messages
        add constraint messages_type_check check (type in ('text','system','activity','poll','image'));
    exception when duplicate_object then null;
    end;
  end if;
exception when undefined_table then
  raise notice 'messages table not found — run supabase-setup.sql first';
end $$;

-- Ensure storage buckets exist (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
