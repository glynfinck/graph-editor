-- ============================================================================
-- Graphs move out of the jsonb `data` column into real node/edge tables so
-- large graphs stay queryable and upcoming features (weights, direction,
-- image/map overlays) have somewhere to live. The canvas document is now
-- assembled from these tables; `replace_graph_doc` swaps a graph's contents
-- atomically.
-- ============================================================================

alter table public.graphs
  add column directed boolean not null default false;

-- Ids are uuids (client-minted via crypto.randomUUID) so they're globally
-- unique, not just unique-per-graph — this future-proofs cross-graph features
-- (e.g. map overlays). The composite pk still scopes an id to its graph, and
-- the composite fk still guarantees an edge only joins nodes in its OWN graph.
-- `name` is the human label (was `label`); weight/name on an edge are the
-- per-edge attributes — a "plain" graph simply leaves them null.
create table public.graph_nodes (
  graph_id uuid not null references public.graphs (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  x double precision not null,
  y double precision not null,
  primary key (graph_id, id)
);

create table public.graph_edges (
  graph_id uuid not null references public.graphs (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  source uuid not null,
  target uuid not null,
  -- null = unweighted edge; a weighted graph is one whose edges carry weights
  weight double precision check (weight is null or weight >= 0),
  -- optional edge label (e.g. a relationship name); null = unlabeled
  name text check (name is null or char_length(name) between 1 and 40),
  primary key (graph_id, id),
  foreign key (graph_id, source)
    references public.graph_nodes (graph_id, id) on delete cascade,
  foreign key (graph_id, target)
    references public.graph_nodes (graph_id, id) on delete cascade
);

create index graph_edges_source_idx on public.graph_edges (graph_id, source);
create index graph_edges_target_idx on public.graph_edges (graph_id, target);

-- Retire the jsonb column: the tables above are the source of truth now
-- (populated by the seed and by the app via replace_graph_doc). The old
-- text-keyed jsonb documents can't be carried over one-to-one — their ids were
-- graph-local text, not uuids — so nothing is copied; a fresh db is empty here
-- anyway, and this schema was never shipped with real data.
alter table public.graphs drop column data;

grant insert (directed) on public.graphs to authenticated;
grant update (directed) on public.graphs to authenticated;

-- ----------------------------------------------------------------------------
-- atomic document replace: one transaction, ownership enforced explicitly.
-- SECURITY DEFINER so the per-column grants on graphs don't block the
-- updated_at bump; the auth.uid() ownership check is the gate.
-- ----------------------------------------------------------------------------
create or replace function public.replace_graph_doc(
  p_graph_id uuid,
  p_nodes jsonb,
  p_edges jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.graphs
    where id = p_graph_id
      and owner_id = (select auth.uid())
      and not is_sample
  ) then
    return false;
  end if;

  delete from public.graph_edges where graph_id = p_graph_id;
  delete from public.graph_nodes where graph_id = p_graph_id;

  insert into public.graph_nodes (graph_id, id, name, x, y)
  select p_graph_id, (n ->> 'id')::uuid, n ->> 'name',
         (n ->> 'x')::double precision, (n ->> 'y')::double precision
  from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) n;

  insert into public.graph_edges (graph_id, id, source, target, weight, name)
  select p_graph_id, (e ->> 'id')::uuid, (e ->> 'source')::uuid,
         (e ->> 'target')::uuid, (e ->> 'weight')::double precision,
         e ->> 'name'
  from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) e;

  update public.graphs set updated_at = now() where id = p_graph_id;
  return true;
end;
$$;

revoke all on function public.replace_graph_doc(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_graph_doc(uuid, jsonb, jsonb)
  to authenticated;

-- ----------------------------------------------------------------------------
-- row level security — visibility follows the parent graph
-- ----------------------------------------------------------------------------
alter table public.graph_nodes enable row level security;
alter table public.graph_edges enable row level security;

create policy "graph_nodes: follow graph read"
  on public.graph_nodes for select
  using (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and (g.is_public or g.owner_id = (select auth.uid()))
  ));

create policy "graph_nodes: owners write"
  on public.graph_nodes for all
  to authenticated
  using (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and g.owner_id = (select auth.uid())
      and not g.is_sample
  ))
  with check (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and g.owner_id = (select auth.uid())
      and not g.is_sample
  ));

create policy "graph_edges: follow graph read"
  on public.graph_edges for select
  using (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and (g.is_public or g.owner_id = (select auth.uid()))
  ));

create policy "graph_edges: owners write"
  on public.graph_edges for all
  to authenticated
  using (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and g.owner_id = (select auth.uid())
      and not g.is_sample
  ))
  with check (exists (
    select 1 from public.graphs g
    where g.id = graph_id
      and g.owner_id = (select auth.uid())
      and not g.is_sample
  ));

-- ----------------------------------------------------------------------------
-- privileges (mirrors init: explicit and minimal; RLS applies on top)
-- ----------------------------------------------------------------------------
revoke all on public.graph_nodes from anon, authenticated;
revoke all on public.graph_edges from anon, authenticated;

grant select on public.graph_nodes to anon, authenticated;
grant select on public.graph_edges to anon, authenticated;
grant insert, update, delete on public.graph_nodes to authenticated;
grant insert, update, delete on public.graph_edges to authenticated;
