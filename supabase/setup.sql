-- Movie Ranker database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- Safe to run again if you need to.

-- People: a display name, a friend code to share, and their own moments (tags).
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Movie fan' check (char_length(display_name) between 1 and 40),
  friend_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  custom_tags text[] not null default '{}' check (cardinality(custom_tags) <= 50),
  created_at timestamptz not null default now()
);

-- One row per movie a person has ranked. "movie" keeps a copy of its details
-- (title, year, series, franchise, poster) so lists show without looking each one up again.
create table if not exists public.ratings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_id text not null check (char_length(movie_id) <= 60),
  movie jsonb not null default '{}' check (jsonb_typeof(movie) = 'object' and pg_column_size(movie) < 4000),
  score int not null check (score between 1 and 100),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  rated_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- Friend links. "pending" until the other person accepts.
create table if not exists public.friendships (
  requester uuid not null default auth.uid() references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- Friend or Best friend. Private: only the person who set the label can see it.
create table if not exists public.friend_labels (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  friend uuid not null references auth.users on delete cascade,
  label text not null default 'friend' check (label in ('friend', 'best')),
  primary key (owner, friend)
);

-- Make a profile automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 40), 'Movie fan'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers for the rules below.
create or replace function public.is_connected(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships
    where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid()));
$$;

create or replace function public.are_friends(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid())));
$$;

-- Add a friend by their code. If they already asked you, this accepts.
create or replace function public.send_friend_request(code text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select id into target from profiles where friend_code = upper(trim(code));
  if target is null then raise exception 'No one has that friend code.'; end if;
  if target = auth.uid() then raise exception 'That is your own code.'; end if;
  if exists (select 1 from friendships where requester = target and addressee = auth.uid()) then
    update friendships set status = 'accepted' where requester = target and addressee = auth.uid();
    return 'You are now friends.';
  end if;
  if exists (select 1 from friendships where requester = auth.uid() and addressee = target) then
    return 'Request already sent.';
  end if;
  insert into friendships (requester, addressee) values (auth.uid(), target);
  return 'Request sent. They need to accept it.';
end $$;

-- Rules: who can see and change what. (Row Level Security)
alter table public.profiles enable row level security;
alter table public.ratings enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_labels enable row level security;

drop policy if exists "see own and connected profiles" on public.profiles;
create policy "see own and connected profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_connected(id));
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "see own and friends' ratings" on public.ratings;
create policy "see own and friends' ratings" on public.ratings for select to authenticated
  using (user_id = auth.uid() or public.are_friends(user_id));
drop policy if exists "add own ratings" on public.ratings;
create policy "add own ratings" on public.ratings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "change own ratings" on public.ratings;
create policy "change own ratings" on public.ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "remove own ratings" on public.ratings;
create policy "remove own ratings" on public.ratings for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
drop policy if exists "accept requests sent to me" on public.friendships;
create policy "accept requests sent to me" on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));
-- No insert rule on friendships: requests only go through send_friend_request().

drop policy if exists "own labels only" on public.friend_labels;
create policy "own labels only" on public.friend_labels for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Let signed-in people reach the tables at all (the rules above still decide which rows).
-- Newer Supabase projects don't grant this automatically. Signed-out visitors get nothing.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, custom_tags) on public.profiles to authenticated;  -- the friend code can't be changed
grant select, insert, update, delete on public.ratings to authenticated;
grant select, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.friend_labels to authenticated;
revoke truncate, references, trigger on public.profiles, public.ratings, public.friendships, public.friend_labels from authenticated;
revoke all on public.profiles, public.ratings, public.friendships, public.friend_labels from anon;
revoke execute on function public.is_connected(uuid), public.are_friends(uuid), public.send_friend_request(text) from public, anon;
grant execute on function public.is_connected(uuid), public.are_friends(uuid), public.send_friend_request(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
