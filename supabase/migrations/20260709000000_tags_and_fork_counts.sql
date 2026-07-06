-- Topic tags for discovery (explore filtering + search), on the two content
-- types that appear in the public feed. Values come from the app's fixed
-- taxonomy (lib/tags.ts); an enum would force a migration per new topic.
alter table public.graphs
  add column tags text[] not null default '{}';
alter table public.posts
  add column tags text[] not null default '{}';

create index graphs_tags_idx on public.graphs using gin (tags);
create index posts_tags_idx on public.posts using gin (tags);

-- column-level grants (see init migration): new columns are writable only
-- where the row policies already allow writes
grant insert (tags) on public.graphs to authenticated;
grant update (tags) on public.graphs to authenticated;
grant insert (tags) on public.posts to authenticated;
grant update (tags) on public.posts to authenticated;

-- Fork counts for the explore feed. SECURITY DEFINER on purpose: forks are
-- private projects, so RLS would hide most of them from other readers — the
-- aggregate is public social proof, the rows themselves stay private.
create or replace function public.post_fork_counts(p_post_ids uuid[])
returns table (post_id uuid, fork_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select forked_from_post_id, count(*)
  from public.projects
  where forked_from_post_id = any (p_post_ids)
  group by forked_from_post_id
$$;

grant execute on function public.post_fork_counts(uuid[]) to anon, authenticated;
