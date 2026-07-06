-- Card thumbnails for the list pages. The naive embed ("first N rows, no
-- order") sampled a spatially clustered corner of big graphs — nodes insert
-- roughly in drawing order, so a prefix is one region of the canvas, and
-- independently-sampled edges rarely connect it. This samples every k-th
-- node AND every k-th edge across the whole id order (an even sweep of the
-- canvas), then adds the sampled edges' endpoints so every edge renders.
--
-- SECURITY INVOKER on purpose: RLS on graphs/graph_nodes/graph_edges keeps
-- scoping exactly what the caller could already read via embeds.
create or replace function public.graph_previews(
  p_graph_ids uuid[],
  p_max_nodes int default 80,
  p_max_edges int default 120
)
returns table (graph_id uuid, directed boolean, nodes jsonb, edges jsonb)
language sql
stable
set search_path = public
as $$
with wanted as (
  select id, directed from public.graphs where id = any (p_graph_ids)
),
numbered_nodes as (
  select n.graph_id, n.id, n.x, n.y,
         row_number() over (partition by n.graph_id order by n.id) as rn,
         count(*) over (partition by n.graph_id) as total
  from public.graph_nodes n
  where n.graph_id in (select id from wanted)
),
numbered_edges as (
  select e.graph_id, e.id, e.source, e.target,
         row_number() over (partition by e.graph_id order by e.id) as rn,
         count(*) over (partition by e.graph_id) as total
  from public.graph_edges e
  where e.graph_id in (select id from wanted)
),
sampled_edges as (
  select graph_id, id, source, target from numbered_edges
  where (rn - 1) % greatest(1, (total + p_max_edges - 1) / p_max_edges) = 0
),
sampled_nodes as (
  select graph_id, id, x, y from numbered_nodes
  where (rn - 1) % greatest(1, (total + p_max_nodes - 1) / p_max_nodes) = 0
),
preview_nodes as (
  select distinct graph_id, id, x, y
  from (
    select graph_id, id, x, y from sampled_nodes
    union all
    -- endpoints of the sampled edges, so every kept edge can draw
    select nn.graph_id, nn.id, nn.x, nn.y
    from numbered_nodes nn
    join sampled_edges se
      on se.graph_id = nn.graph_id
     and (se.source = nn.id or se.target = nn.id)
  ) unioned
)
select
  w.id as graph_id,
  w.directed,
  coalesce(
    (select jsonb_agg(
       jsonb_build_object('id', p.id, 'x', round(p.x), 'y', round(p.y)))
     from preview_nodes p where p.graph_id = w.id),
    '[]'::jsonb
  ) as nodes,
  coalesce(
    (select jsonb_agg(jsonb_build_object('source', s.source, 'target', s.target))
     from sampled_edges s where s.graph_id = w.id),
    '[]'::jsonb
  ) as edges
from wanted w;
$$;

grant execute on function public.graph_previews(uuid[], int, int)
  to anon, authenticated;
