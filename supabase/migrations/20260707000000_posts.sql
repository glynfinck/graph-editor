-- ----------------------------------------------------------------------------
-- Community posts: markdown write-ups about algorithms + graphs. A post can
-- attach one of the author's projects (readers fork it); ownerless official
-- posts (like ownerless sample graphs) carry the built-in lessons. Likes and
-- comments follow the graph_likes patterns.
-- ----------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  -- references profiles (not auth.users) so PostgREST can embed the author;
  -- profiles cascade from auth.users, so delete semantics are identical.
  owner_id uuid references public.profiles (id) on delete cascade,
  is_official boolean not null default false,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 50000),
  project_id uuid references public.projects (id) on delete set null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint official_are_ownerless check (not is_official or owner_id is null),
  constraint ownerless_are_official check (owner_id is not null or is_official),
  constraint official_are_published check (not is_official or is_published)
);

create index posts_published_idx
  on public.posts (published_at desc)
  where is_published;
create index posts_owner_idx on public.posts (owner_id, updated_at desc);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- published_at orders the feed, so it is server-managed (never granted):
-- stamped when a post becomes published, cleared when it goes back to draft.
create or replace function public.set_post_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at = now();
  elsif not new.is_published then
    new.published_at = null;
  end if;
  return new;
end;
$$;

create trigger posts_published_at
  before insert or update on public.posts
  for each row execute function public.set_post_published_at();

-- FK checks ignore RLS, so without this a user could attach someone else's
-- project id. SECURITY DEFINER so the ownership lookup sees the real row.
-- Ownerless (official) posts can never attach a project (no ownerless
-- projects exist).
create or replace function public.enforce_post_project_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.owner_id = new.owner_id
  ) then
    raise exception 'attached project must belong to the post owner';
  end if;
  return new;
end;
$$;

create trigger posts_project_owner
  before insert or update on public.posts
  for each row execute function public.enforce_post_project_owner();

alter table public.posts enable row level security;

create policy "posts: published or own read"
  on public.posts for select
  using (is_published or owner_id = (select auth.uid()));

create policy "posts: owners insert"
  on public.posts for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and not is_official);

create policy "posts: owners update"
  on public.posts for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and not is_official);

create policy "posts: owners delete"
  on public.posts for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.posts to anon, authenticated;
grant insert (owner_id, title, body, project_id, is_published)
  on public.posts to authenticated;
grant update (title, body, project_id, is_published)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;

-- ----------------------------------------------------------------------------
-- post_likes: mirrors graph_likes with published-or-own visibility
-- ----------------------------------------------------------------------------
create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_id_idx on public.post_likes (user_id);

alter table public.post_likes enable row level security;

create policy "post_likes: visible with their post"
  on public.post_likes for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (p.is_published or p.owner_id = (select auth.uid()))
    )
  );

create policy "post_likes: users like published posts as themselves"
  on public.post_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.is_published
    )
  );

create policy "post_likes: users remove their own likes"
  on public.post_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.post_likes to anon, authenticated;
grant insert (post_id, user_id) on public.post_likes to authenticated;
grant delete on public.post_likes to authenticated;

-- ----------------------------------------------------------------------------
-- post_comments: flat, plain-text; deletable by the author or the post owner
-- ----------------------------------------------------------------------------
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

create policy "post_comments: visible with their post"
  on public.post_comments for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
        and (p.is_published or p.owner_id = (select auth.uid()))
    )
  );

create policy "post_comments: users comment on published posts"
  on public.post_comments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.is_published
    )
  );

create policy "post_comments: author or post owner deletes"
  on public.post_comments for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.posts p
      where p.id = post_id and p.owner_id = (select auth.uid())
    )
  );

grant select on public.post_comments to anon, authenticated;
grant insert (post_id, user_id, body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;

-- ----------------------------------------------------------------------------
-- fork lineage: a project can record which post it was forked from
-- ----------------------------------------------------------------------------
alter table public.projects
  add column forked_from_post_id uuid
    references public.posts (id) on delete set null;

grant insert (forked_from_post_id) on public.projects to authenticated;
