---
name: verify
description: Build, run and drive this Next.js + Supabase app to verify changes end-to-end.
---

# Verifying graph-editor changes

## Run

- A `next dev` daemon is usually already running on **http://localhost:3000** (Next 16 refuses a second dev server for the same dir — drive the existing one; it hot-reloads your edits). Its log: `.next/dev/logs/next-development.log` — check it for server errors after driving.
- Local Supabase must be up (`supabase status`; API on 127.0.0.1:54331, DB on 54332). `.env.local` already points at it. Apply new migrations with `supabase migration up`, regenerate types with `supabase gen types typescript --local > types/database.ts`.
- No psql on PATH — use `docker exec supabase_db_graph-editor psql -U postgres -d postgres -c "..."`.

## Drive

- Playwright is installed globally (`npx playwright`); the driver package isn't in this repo — `npm i playwright` in a scratch dir and run scripts from there.
- To make skeletons/pending states observable, temporarily add `await new Promise((r) => setTimeout(r, 1200))` at the top of `createClient()` in `lib/supabase/server.ts` (slows every server-side Supabase round). **Remove before committing.** Browser network throttling does NOT slow these server-side calls.
- Signed-in flows without OAuth: local email signup works —
  `POST http://127.0.0.1:54331/auth/v1/signup` with the local anon key (`supabase status`) → take the session JSON and set cookie `sb-127-auth-token` = `"base64-" + base64url(JSON.stringify({access_token, token_type:"bearer", expires_in, expires_at, refresh_token, user}))` on domain `localhost`. Seed owned rows via PostgREST with the user's bearer token.
  Clean up after: `delete from auth.users where email='...'` (cascades to profiles/projects/graphs).
- List-page pending state is observable via `[aria-busy="true"]` on the results wrapper (PendingOverlay in `components/site/list-transition.tsx`); the dimmed layer is its first child (computed opacity 0.5 while pending).

## Gates

`npm run lint` (0 warnings), `npx tsc --noEmit`, `npm test` (unit), `npm run build`.
