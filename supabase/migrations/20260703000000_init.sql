-- ============================================================================
-- graph-editor initial schema
--
-- Security model: RLS is the authoritative enforcement layer everywhere.
-- App-level checks (server actions, UI gating) are UX only. Graphs are
-- PRIVATE BY DEFAULT — a user's graphs are invisible to everyone else unless
-- explicitly marked public. Built-in sample graphs are ownerless, public and
-- immutable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on sign-up
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- graphs: the documents this app edits. `data` holds the canvas document:
--   { "nodes": [{ "id", "label", "x", "y" }], "edges": [{ "id", "source", "target" }] }
-- ----------------------------------------------------------------------------
create table public.graphs (
  id uuid primary key default gen_random_uuid(),
  -- null owner = built-in sample (no user can ever own or edit it)
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  data jsonb not null default '{"nodes": [], "edges": []}'
    check (jsonb_typeof(data) = 'object'),
  is_public boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint samples_are_public check (not is_sample or is_public),
  constraint samples_are_ownerless check (not is_sample or owner_id is null)
);

create index graphs_owner_idx on public.graphs (owner_id, updated_at desc);
create index graphs_samples_idx on public.graphs (is_sample) where is_sample;

-- ----------------------------------------------------------------------------
-- functions & triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger graphs_set_updated_at
  before update on public.graphs
  for each row execute function public.set_updated_at();

-- Auto-create a profile for every new auth user (OAuth or email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- row level security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.graphs enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select
  using (true);

create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Isolation: a graph row is visible only to its owner, unless public/sample.
create policy "graphs: public or own read"
  on public.graphs for select
  using (is_public or owner_id = (select auth.uid()));

create policy "graphs: owners insert"
  on public.graphs for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and not is_sample);

create policy "graphs: owners update"
  on public.graphs for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not is_sample);

create policy "graphs: owners delete"
  on public.graphs for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- privileges: revoke everything, then grant precisely what the API roles use.
-- Column-level grants keep `is_sample` and ownership out of user hands even
-- if a policy were ever loosened. (RLS still applies on top of all of this.)
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select on public.graphs to anon, authenticated;
grant insert (owner_id, name, description, data, is_public)
  on public.graphs to authenticated;
grant update (name, description, data, is_public)
  on public.graphs to authenticated;
grant delete on public.graphs to authenticated;
