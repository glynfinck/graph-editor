-- ============================================================================
-- Structured name columns for the email/password signup flow.
--
-- Email signups now collect a first + last name; store them alongside the
-- derived display_name so they can be maintained independently (and filled in
-- later by OAuth users who never provided them).
-- ============================================================================

alter table public.profiles
  add column first_name text,
  add column last_name  text;

-- Let users edit their own name. Extends the column-level update grant from the
-- init migration (which allowed only display_name, avatar_url) — without listing
-- these columns here the write is silently dropped by the grant.
grant update (display_name, avatar_url, first_name, last_name)
  on public.profiles to authenticated;

-- Populate first/last from signup metadata. The existing display_name logic is
-- preserved (email/OAuth users still get a sensible display_name); we just also
-- read the new first_name / last_name keys out of raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, first_name, last_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );
  return new;
end;
$$;
