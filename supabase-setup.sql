-- ============================================================================
-- Drift · supabase-setup.sql
-- Run this ONCE in Supabase Studio → SQL Editor (New query → paste → Run).
-- Creates the full schema for the real (non-demo) app:
--   profiles, rooms, room_members, messages, reactions, follows,
--   notifications, reports + row-level security + realtime + triggers.
-- ============================================================================

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null default '',
  bio          text not null default '',
  status_msg   text not null default 'New here — say hi!',
  avatar_emoji text not null default '',
  hue          int,
  xp           int  not null default 0,
  reads        jsonb not null default '{}',   -- {roomId: lastReadTs(ms)}
  meta         jsonb not null default '{}',   -- streak, quest, onboarded, stats, badges…
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

-- ------------------------------------------------------------------ rooms --
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 40),
  description text not null default '',
  icon        text not null default '💬',
  category    text not null default 'general',
  visibility  text not null default 'public' check (visibility in ('public','private')),
  invite_code text unique,                    -- private rooms: join via code
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  mods        uuid[] not null default '{}',
  slow_mode   int not null default 0,         -- seconds between messages
  tags        text[] not null default '{}',
  rules       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- --------------------------------------------------------------- messages --
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null, -- null = system
  content    text not null default '',
  type       text not null default 'text' check (type in ('text','system','activity','poll')),
  reply_to   uuid references public.messages(id) on delete set null,
  poll       jsonb,
  meta       jsonb,
  pinned     boolean not null default false,
  edited     boolean not null default false,
  deleted    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_room_created on public.messages (room_id, created_at desc);

create table if not exists public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  emoji      text not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (message_id, emoji, user_id)
);

-- ---------------------------------------------------------------- socials --
create table if not exists public.follows (
  follower   uuid not null references public.profiles(id) on delete cascade,
  followed   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followed),
  check (follower <> followed)
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null default 'system',
  title      text not null,
  body       text not null default '',
  actor_id   uuid references public.profiles(id) on delete set null,
  room_id    uuid references public.rooms(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'message',
  message_id  uuid references public.messages(id) on delete set null,
  room_id     uuid references public.rooms(id) on delete set null,
  target_user uuid references public.profiles(id) on delete set null,
  reason      text not null default '',
  status      text not null default 'open' check (status in ('open','escalated','dismissed')),
  created_at  timestamptz not null default now()
);

-- =============================================================== FUNCTIONS ================================================================

-- Auto-create a profile whenever a new auth user appears (reads signup metadata).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, avatar_emoji, hue)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), new.raw_user_meta_data->>'username', 'drifter'),
    coalesce(new.raw_user_meta_data->>'avatar_emoji', ''),
    (new.raw_user_meta_data->>'hue')::int
  );
  return new;
exception when unique_violation then
  -- username already taken: still create the auth user's profile with suffixed name
  insert into public.profiles (id, username, display_name)
  values (new.id, 'user_' || left(new.id::text, 8), 'drifter');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Username → email lookup so people can log in with either (SECURITY DEFINER:
-- exposes only what the login form needs).
create or replace function public.username_to_email(u text)
returns text language sql security definer set search_path = public stable as $$
  select lower((select email from auth.users
                where raw_user_meta_data->>'username' = u
                order by created_at limit 1))
$$;

grant execute on function public.username_to_email(text) to anon, authenticated;

-- Join a private room by invite code without exposing the code to non-members.
create or replace function public.join_room_with_code(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select id into rid from public.rooms where invite_code = upper(trim(code));
  if rid is null then raise exception 'No room found for that code.'; end if;
  insert into public.room_members (room_id, user_id) values (rid, auth.uid())
  on conflict do nothing;
  return rid;
end; $$;

grant execute on function public.join_room_with_code(text) to authenticated;

-- Cast/change a vote on a poll message (votes stored as voter uuids).
create or replace function public.cast_vote(p_message uuid, p_option int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.messages;
  opts jsonb;
  i int;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null or m.poll is null then raise exception 'Poll not found.'; end if;
  if not public.is_room_member(m.room_id) then raise exception 'Join the room first.'; end if;
  if p_option < 0 or p_option >= jsonb_array_length(m.poll->'options') then
    raise exception 'Invalid option.';
  end if;

  opts := m.poll->'options';
  for i in 0 .. jsonb_array_length(opts) - 1 loop
    opts := jsonb_set(opts, array[i::text,'votes'],
      coalesce((select jsonb_agg(v)
                from jsonb_array_elements_text(opts->i->'votes') v
                where v <> auth.uid()::text), '[]'::jsonb));
  end loop;
  opts := jsonb_set(opts, array[p_option::text,'votes'],
    coalesce(opts->p_option->'votes', '[]'::jsonb) || to_jsonb(auth.uid()::text));

  update public.messages set poll = jsonb_set(m.poll, '{options}', opts) where id = p_message;
  return jsonb_set(m.poll, '{options}', opts);
end; $$;

grant execute on function public.cast_vote(uuid, int) to authenticated;

-- Member-count per room (readable by everyone for public rooms).
create or replace function public.member_count(r uuid)
returns int language sql security definer set search_path = public stable as $$
  select count(*)::int from public.room_members where room_id = r
$$;

-- ============================================================== RLS POLICIES ==============================================================

alter table public.profiles      enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.messages      enable row level security;
alter table public.reactions     enable row level security;
alter table public.follows       enable row level security;
alter table public.notifications enable row level security;
alter table public.reports       enable row level security;

-- profiles: public directory, self-service edits
drop policy if exists "profiles readable"    on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (id = auth.uid());

-- helper expression reused below
create or replace function public.is_room_member(r uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.room_members m where m.room_id = r and m.user_id = auth.uid())
$$;

create or replace function public.can_moderate(r uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.rooms x
                 where x.id = r and (x.owner_id = auth.uid() or auth.uid() = any(x.mods)))
$$;

-- rooms: public rooms visible to all; private only to members; owners manage
drop policy if exists "rooms read" on public.rooms;
create policy "rooms read" on public.rooms for select
  using (visibility = 'public' or public.is_room_member(id) or owner_id = auth.uid());
drop policy if exists "rooms create" on public.rooms;
create policy "rooms create" on public.rooms for insert
  with check (owner_id = auth.uid());
drop policy if exists "rooms owner update" on public.rooms;
create policy "rooms owner update" on public.rooms for update
  using (owner_id = auth.uid() or auth.uid() = any(mods));
drop policy if exists "rooms owner delete" on public.rooms;
create policy "rooms owner delete" on public.rooms for delete using (owner_id = auth.uid());

-- memberships: see counts of public rooms, your own rows everywhere
drop policy if exists "members read" on public.room_members;
create policy "members read" on public.room_members for select
  using (public.is_room_member(room_id)
         or exists (select 1 from public.rooms r where r.id = room_id and r.visibility = 'public'));
drop policy if exists "members join" on public.room_members;
create policy "members join" on public.room_members for insert with check (user_id = auth.uid());
drop policy if exists "members leave" on public.room_members;
create policy "members leave" on public.room_members for delete using (user_id = auth.uid());

-- messages: members of the room read/write; authors edit/delete; mods can pin/delete
drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select using (public.is_room_member(room_id));
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert
  with check (public.is_room_member(room_id));
drop policy if exists "messages author update" on public.messages;
create policy "messages author update" on public.messages for update
  using (user_id = auth.uid()
         or public.can_moderate(room_id)          -- pinning / mod-delete
         or (type = 'system'));                   -- system notes by any member
drop policy if exists "messages author delete" on public.messages;
create policy "messages author delete" on public.messages for delete
  using (user_id = auth.uid() or public.can_moderate(room_id));

-- reactions: members toggle their own
drop policy if exists "reactions read" on public.reactions;
create policy "reactions read" on public.reactions for select using (true);
drop policy if exists "reactions write" on public.reactions;
create policy "reactions write" on public.reactions for insert with check (user_id = auth.uid());
drop policy if exists "reactions delete" on public.reactions;
create policy "reactions delete" on public.reactions for delete using (user_id = auth.uid());

-- follows: directory is public, you manage your own outgoing edges
drop policy if exists "follows read" on public.follows;
create policy "follows read" on public.follows for select using (true);
drop policy if exists "follows add" on public.follows;
create policy "follows add" on public.follows for insert with check (follower = auth.uid());
drop policy if exists "follows remove" on public.follows;
create policy "follows remove" on public.follows for delete using (follower = auth.uid());

-- notifications: only yours
drop policy if exists "notifications read" on public.notifications;
create policy "notifications read" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notifications update" on public.notifications;
create policy "notifications update" on public.notifications for update using (user_id = auth.uid());
drop policy if exists "notifications delete" on public.notifications;
create policy "notifications delete" on public.notifications for delete using (user_id = auth.uid());

-- reports: you file and see your own
drop policy if exists "reports insert" on public.reports;
create policy "reports insert" on public.reports for insert with check (reporter_id = auth.uid());
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select using (reporter_id = auth.uid());

-- =============================================================== TRIGGERS ================================================================

-- Notify someone when they gain a follower
create or replace function public.on_follow_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  select display_name into actor from public.profiles where id = new.follower;
  insert into public.notifications (user_id, type, title, body, actor_id)
  values (new.followed, 'friend', 'New follower', actor || ' added you as a friend.', new.follower);
  return new;
end; $$;

drop trigger if exists follow_notify on public.follows;
create trigger follow_notify after insert on public.follows
  for each row execute function public.on_follow_created();

-- Notify the room owner when someone joins
create or replace function public.on_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; own uuid; rname text;
begin
  select display_name into actor from public.profiles where id = new.user_id;
  select owner_id, name into own, rname from public.rooms where id = new.room_id;
  if own is not null and own <> new.user_id then
    insert into public.notifications (user_id, type, title, body, actor_id, room_id)
    values (own, 'invite', 'Room growth', actor || ' joined ' || rname || '.', new.user_id, new.room_id);
  end if;
  return new;
end; $$;

drop trigger if exists member_join_notify on public.room_members;
create trigger member_join_notify after insert on public.room_members
  for each row execute function public.on_member_joined();

-- =============================================================== REALTIME ================================================================
-- Broadcast changes to connected clients. Run each statement separately if one errors.

do $$
declare t text;
begin
  foreach t in array array['messages','rooms','room_members','reactions','notifications','profiles']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; -- already added
    end;
  end loop;
end $$;
