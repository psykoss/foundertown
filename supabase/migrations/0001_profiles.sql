-- Founder Town accounts. One row per auth user: profile, avatar, onboarding answers and the code of
-- their private lobby. Run this in the Supabase SQL editor (or `supabase db push`).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Founder' check (char_length(name) between 1 and 24),
  time_zone text,
  -- small JPEG data URL (or the Google picture URL)
  picture text check (picture is null or char_length(picture) < 200000),
  avatar jsonb,
  -- answers to the founder questions (shared/src/founder.ts)
  onboarding jsonb,
  onboarded_at timestamptz,
  -- unguessable: whoever has the code (the invite link) can enter the lobby
  lobby_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    check (lobby_code ~ '^[a-z0-9]{8,32}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- People edit their profile, not their identity or their lobby code.
revoke update on public.profiles from authenticated;
grant update (name, time_zone, picture, avatar, onboarding, onboarded_at) on public.profiles to authenticated;

-- Every new account gets its row, named after the Google profile or the email address.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, picture)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Founder'), 24),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Who owns the lobby with this code? Returns the owner's name, or null if there is no such lobby.
-- The only thing a signed-in user can learn about someone else's row.
create function public.lobby_info(code text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.profiles where lobby_code = code;
$$;

revoke execute on function public.lobby_info(text) from public, anon;
grant execute on function public.lobby_info(text) to authenticated;
