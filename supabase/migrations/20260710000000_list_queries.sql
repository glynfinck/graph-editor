-- ============================================================================
-- List-page queries move into the database. The list pages used to pull every
-- visible row (with every like row embedded) and filter/sort/paginate in
-- memory per request; these views and functions let them fetch exactly one
-- page with aggregate counts instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Stats views: base rows plus the counts the cards show. security_invoker so
-- the underlying tables' RLS keeps deciding row visibility.
-- ----------------------------------------------------------------------------

create view public.graph_summaries
with (security_invoker = on) as
select
  g.*,
  (select count(*) from public.graph_nodes n where n.graph_id = g.id) as node_count,
  (select count(*) from public.graph_edges e where e.graph_id = g.id) as edge_count,
  (select count(*) from public.graph_likes l where l.graph_id = g.id) as like_count
from public.graphs g;

create view public.post_summaries
with (security_invoker = on) as
select
  p.*,
  (select count(*) from public.post_likes l where l.post_id = p.id) as like_count,
  (select count(*) from public.post_comments c where c.post_id = p.id) as comment_count
from public.posts p;

grant select on public.graph_summaries to anon, authenticated;
grant select on public.post_summaries to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Explore feed pages. Sorting must happen here rather than over PostgREST:
-- "trending" is a computed, now()-relative score (the SQL twin of
-- lib/list-filters.ts trendingScore). total_count rides along on every row
-- so one call returns a page plus its pager math. SECURITY INVOKER: the rows
-- are filtered to public/published content, which RLS grants everyone anyway.
-- ----------------------------------------------------------------------------

create or replace function public.explore_posts(
  p_q text default null,
  p_tag text default null,
  p_sort text default 'trending',
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  owner_id uuid,
  is_official boolean,
  title text,
  body text,
  project_id uuid,
  is_published boolean,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  tags text[],
  like_count bigint,
  comment_count bigint,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.owner_id, s.is_official, s.title, s.body, s.project_id,
    s.is_published, s.published_at, s.created_at, s.updated_at, s.tags,
    s.like_count, s.comment_count,
    count(*) over () as total_count
  from public.post_summaries s,
    lateral (
      select case
        when p_q is null or p_q = '' then null
        else '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pat
    ) needle
  where s.is_published
    and not s.is_official
    and (p_tag is null or s.tags @> array[p_tag])
    and (needle.pat is null or s.title ilike needle.pat or s.body ilike needle.pat)
  order by
    case when p_sort = 'likes' then s.like_count end desc,
    case when p_sort = 'trending' then
      (s.like_count + 1)::numeric
        / power(
            greatest(extract(epoch from (now() - coalesce(s.published_at, 'epoch'::timestamptz))) / 86400.0, 0) + 2,
            1.5
          )
    end desc,
    s.published_at desc
  limit p_limit offset p_offset
$$;

create or replace function public.explore_graphs(
  p_q text default null,
  p_tag text default null,
  p_sort text default 'trending',
  p_limit int default 12,
  p_offset int default 0
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  is_public boolean,
  is_sample boolean,
  created_at timestamptz,
  updated_at timestamptz,
  directed boolean,
  tags text[],
  node_count bigint,
  edge_count bigint,
  like_count bigint,
  total_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.owner_id, s.name, s.description, s.is_public, s.is_sample,
    s.created_at, s.updated_at, s.directed, s.tags,
    s.node_count, s.edge_count, s.like_count,
    count(*) over () as total_count
  from public.graph_summaries s,
    lateral (
      select case
        when p_q is null or p_q = '' then null
        else '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as pat
    ) needle
  where s.is_public
    and (p_tag is null or s.tags @> array[p_tag])
    and (needle.pat is null or s.name ilike needle.pat or s.description ilike needle.pat)
  order by
    case when p_sort = 'likes' then s.like_count end desc,
    case when p_sort = 'trending' then
      (s.like_count + 1)::numeric
        / power(
            greatest(extract(epoch from (now() - s.updated_at)) / 86400.0, 0) + 2,
            1.5
          )
    end desc,
    s.updated_at desc
  limit p_limit offset p_offset
$$;

grant execute on function public.explore_posts(text, text, text, int, int)
  to anon, authenticated;
grant execute on function public.explore_graphs(text, text, text, int, int)
  to anon, authenticated;
