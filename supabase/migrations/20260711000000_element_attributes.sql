-- ============================================================================
-- Per-element attributes. `weight`/`name` cover the built-in edge attributes,
-- but algorithms need arbitrary per-node/per-edge data (a max-flow's capacity,
-- a colouring's colour, a scheduler's duration). Rather than an EAV table —
-- which would multiply every node/edge into many rows that replace_graph_doc
-- would have to delete-all-reinsert each save — attributes live in a jsonb bag
-- on the element itself, riding the existing atomic document swap. Values are
-- JSON scalars (string / number / boolean); editing is UI-only, Python reads.
-- ============================================================================

alter table public.graph_nodes
  add column attributes jsonb not null default '{}'::jsonb;

alter table public.graph_edges
  add column attributes jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- replace_graph_doc gains the attributes column on both inserts. Unchanged
-- signature, so the existing grants/ownership gate carry over (create or
-- replace preserves them). `-> 'attributes'` (not `->>`) keeps the value as
-- jsonb; coalesce tolerates old payloads that omit the key.
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

  insert into public.graph_nodes (graph_id, id, name, x, y, attributes)
  select p_graph_id, (n ->> 'id')::uuid, n ->> 'name',
         (n ->> 'x')::double precision, (n ->> 'y')::double precision,
         coalesce(n -> 'attributes', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) n;

  insert into public.graph_edges (graph_id, id, source, target, weight, name, attributes)
  select p_graph_id, (e ->> 'id')::uuid, (e ->> 'source')::uuid,
         (e ->> 'target')::uuid, (e ->> 'weight')::double precision,
         e ->> 'name',
         coalesce(e -> 'attributes', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) e;

  update public.graphs set updated_at = now() where id = p_graph_id;
  return true;
end;
$$;
