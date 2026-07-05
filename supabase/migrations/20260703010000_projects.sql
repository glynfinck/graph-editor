-- ============================================================================
-- Projects: multi-file Python workspaces. A project stores code (files with
-- slash-separated paths, folders implicit) and points at any visible graph
-- as its test fixture. Projects are strictly private to their owner.
-- ============================================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  -- the graph currently selected for testing; FK only, RLS still applies
  -- when the graph is read back (an invisible graph loads as null)
  active_graph_id uuid references public.graphs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_idx on public.projects (owner_id, updated_at desc);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- "algos/bfs.py" — folders are implicit in the path
  path text not null check (
    char_length(path) between 1 and 200
    and path ~ '^[A-Za-z0-9_][A-Za-z0-9._/-]*$'
    and path !~ '\.\.'
    and path !~ '//'
    and path !~ '/$'
  ),
  content text not null default '' check (char_length(content) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create index project_files_project_idx on public.project_files (project_id, path);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger project_files_set_updated_at
  before update on public.project_files
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- row level security: owner-only on projects; files inherit via the parent
-- ----------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_files enable row level security;

create policy "projects: owners all"
  on public.projects for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "project files: via owned project"
  on public.project_files for all
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- privileges (RLS applies on top). No anon access at all — projects are
-- private; ownership transfer is impossible (owner_id not updatable).
-- ----------------------------------------------------------------------------
grant select on public.projects to authenticated;
grant insert (owner_id, name, description, active_graph_id)
  on public.projects to authenticated;
grant update (name, description, active_graph_id)
  on public.projects to authenticated;
grant delete on public.projects to authenticated;

grant select on public.project_files to authenticated;
grant insert (project_id, path, content) on public.project_files to authenticated;
grant update (path, content) on public.project_files to authenticated;
grant delete on public.project_files to authenticated;
