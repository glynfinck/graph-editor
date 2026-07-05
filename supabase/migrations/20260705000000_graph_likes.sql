-- ----------------------------------------------------------------------------
-- Community likes. One row per (graph, user); the explore page ranks
-- community graphs by how many rows a graph has. Liking follows visibility:
-- you can like any graph you can see, and unlike anything you liked.
-- ----------------------------------------------------------------------------

create table public.graph_likes (
  graph_id uuid not null references public.graphs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (graph_id, user_id)
);

-- own-likes lookups (the PK already covers per-graph counts)
create index graph_likes_user_id_idx on public.graph_likes (user_id);

-- ----------------------------------------------------------------------------
-- row level security
-- ----------------------------------------------------------------------------
alter table public.graph_likes enable row level security;

-- Likes are as visible as the graph they belong to.
create policy "graph_likes: visible with their graph"
  on public.graph_likes for select
  using (
    exists (
      select 1
      from public.graphs g
      where g.id = graph_id
        and (g.is_public or g.owner_id = (select auth.uid()))
    )
  );

create policy "graph_likes: users like visible graphs as themselves"
  on public.graph_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.graphs g
      where g.id = graph_id
        and (g.is_public or g.owner_id = (select auth.uid()))
    )
  );

create policy "graph_likes: users remove their own likes"
  on public.graph_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- privileges (see the init migration: revoke-everything is already in place)
-- ----------------------------------------------------------------------------
grant select on public.graph_likes to anon, authenticated;
grant insert (graph_id, user_id) on public.graph_likes to authenticated;
grant delete on public.graph_likes to authenticated;
