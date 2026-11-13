-- The office of a private lobby: the departments its owner laid out on the floor (shared/src/office.ts).
-- One row per owner, written only by them; everyone who has the lobby code reads it through lobby_office().
-- Run this in the Supabase SQL editor (or `supabase db push`) after 0001_profiles.sql.

create table public.offices (
  owner uuid primary key references public.profiles (id) on delete cascade,
  -- { "spaces": [{ "id", "kind", "x", "y", "w", "h" }] } — checked again by the game server before it is used
  layout jsonb not null check (jsonb_typeof(layout) = 'object' and octet_length(layout::text) < 20000),
  updated_at timestamptz not null default now()
);

alter table public.offices enable row level security;

create policy "read own office" on public.offices for select to authenticated using (auth.uid() = owner);
create policy "create own office" on public.offices for insert to authenticated with check (auth.uid() = owner);
create policy "update own office" on public.offices for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);

-- What someone entering a lobby needs: the owner's name, whether the caller is that owner, and the
-- saved office (null if none). Returns null if there is no such lobby. Like lobby_info(), knowing
-- the code is the access.
create function public.lobby_office(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'mine', p.id = auth.uid(), 'layout', o.layout)
  from public.profiles p
  left join public.offices o on o.owner = p.id
  where p.lobby_code = code;
$$;

revoke execute on function public.lobby_office(text) from public, anon;
grant execute on function public.lobby_office(text) to authenticated;
