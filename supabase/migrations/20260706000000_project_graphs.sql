-- ----------------------------------------------------------------------------
-- Projects grow up for the posts platform:
--   * is_public — publishing a post flips its attached project public so
--     readers can browse the files and fork them.
--   * project_graphs — a project now pins MANY graphs (the test-graph picker
--     gains a "This project" group); active_graph_id remains "the one on the
--     canvas" and is always among the pins (enforced app-side).
-- ----------------------------------------------------------------------------

alter table public.projects
  add column is_public boolean not null default false;

-- Read opens up to everyone when public; writes stay owner-only via the
-- existing "projects: owners all" policy (permissive policies OR together).
create policy "projects: public read"
  on public.projects for select
  using (is_public or owner_id = (select auth.uid()));

create policy "project files: follow project read"
  on public.project_files for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.is_public or p.owner_id = (select auth.uid()))
    )
  );

grant select on public.projects to anon;
grant select on public.project_files to anon;
grant update (is_public) on public.projects to authenticated;

-- ----------------------------------------------------------------------------
-- project_graphs: the pinned test graphs of a project
-- ----------------------------------------------------------------------------
create table public.project_graphs (
  project_id uuid not null references public.projects (id) on delete cascade,
  graph_id uuid not null references public.graphs (id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (project_id, graph_id)
);

create index project_graphs_graph_idx on public.project_graphs (graph_id);

alter table public.project_graphs enable row level security;

create policy "project_graphs: follow project read"
  on public.project_graphs for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (p.is_public or p.owner_id = (select auth.uid()))
    )
  );

-- Owners pin only graphs they can see (public/sample or their own).
create policy "project_graphs: owners pin visible graphs"
  on public.project_graphs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from public.graphs g
      where g.id = graph_id
        and (g.is_public or g.owner_id = (select auth.uid()))
    )
  );

create policy "project_graphs: owners reorder"
  on public.project_graphs for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "project_graphs: owners unpin"
  on public.project_graphs for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

grant select on public.project_graphs to anon, authenticated;
grant insert (project_id, graph_id, position)
  on public.project_graphs to authenticated;
grant update (position) on public.project_graphs to authenticated;
grant delete on public.project_graphs to authenticated;

-- Every project's current test graph becomes its first pin.
insert into public.project_graphs (project_id, graph_id)
select id, active_graph_id
from public.projects
where active_graph_id is not null;
