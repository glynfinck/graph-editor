# graph-editor

An interactive graph editor where **real Python drives the canvas**. Draw a
graph, write a traversal in Python (networkx included), press Run — and watch
every step of the algorithm animate in front of you, with play / pause / step /
scrub controls.

A ground-up rewrite of the original `graph-editor-react` prototype on a modern
stack: the part that was always right — Python executing in the browser and
talking to the React DOM — is preserved and hardened; everything around it is
new.

## Stack

- **Next.js 16** (App Router, RSC) · **React 19** · **TypeScript** (strict)
- **Tailwind v4** (CSS-configured) + **shadcn/ui** (`radix-nova` style).
  Pastel & muted identity, light-first, deliberately un-terminal (mono lives
  only inside the code editor). **Four user-selectable palettes** — Gouache
  (default), Sea Glass, Riso Print, Clay & Moss — implemented as
  `data-palette` token sets in `globals.css`; each keeps the algorithm states
  (cursor / visited / path) distinct via pastel fills with deeper ink
  borders. Figtree + JetBrains Mono
- **Supabase**: Postgres + Auth (GitHub, Google, email) + RLS, via
  `@supabase/ssr`
- **@xyflow/react (React Flow 12)** for the canvas, **Monaco** for the code
  editor, **Zustand** for editor state
- **Pyodide 0.29** (CPython on WebAssembly) + **networkx** in a Web Worker
- **Vercel** for app deploys, **GitHub Actions** for CI + DB migrations

## How the Python ↔ React bridge works

The crown jewel, modernized from the original prototype:

```
canvas graph (Zustand) ──▶ worker.postMessage({ runId, prelude, code, graph })
                                    │
                        Web Worker: Pyodide + networkx
              prelude defines `graph` (a networkx wrapper) whose
              highlight methods emit JSON frames via a registered
              JS bridge module; print() is captured via setStdout
                                    │
     { frame } / { stdout } / { done } / { error } ──▶ editor store
                                    │
        playback engine folds frames[0..playhead) into visual state
        each render ──▶ React Flow nodes/edges re-style themselves
```

Key properties:

- **Frames are JSON-safe** — no PyProxy objects cross the boundary.
- **Fresh namespace per run** — no state bleeds between runs, and tracebacks
  point at the user's own line numbers (the prelude runs separately).
- **No completion timers** — `postMessage` is FIFO, so `done` always arrives
  after the last frame (the original needed a 100 ms hack).
- **Stop** terminates the worker and boots a fresh one — runaway
  `while True:` loops can't wedge the page.

### The Python API (available as `graph` in the editor)

| Method | Effect |
| --- | --- |
| `graph.getNodes()` / `graph.getEdges()` | node labels / edge pairs |
| `graph.getNeighbors(n)` | adjacent labels |
| `graph.hasNode(n)` / `graph.hasEdge(a, b)` | membership checks |
| `graph.setCurrentNode(n, peek=False, path=False)` | move the cursor; mark visited (or path) |
| `graph.setCurrentEdge(a, b, peek=False, path=False)` | same for an edge |
| `graph.G` | the underlying `networkx.Graph` |

`peek=True` highlights without marking visited; `path=True` paints the
element as part of the final path. BFS, DFS and Dijkstra presets are built in.

## Projects: multi-file Python workspaces

Beyond the single-editor scratchpad, **/projects** stores real codebases:

- Files with slash-separated paths (`algos/bfs.py`) — folders are implicit.
  Add, rename and delete from the file tree; everything persists to Postgres
  on Save.
- Before each run the files are written into `/project` on Pyodide's virtual
  filesystem and put on `sys.path`, so **real imports work across files**
  (`from helpers import bfs`), and data files are readable with
  `open("/project/data.txt")`. Stale modules are purged between runs.
- Helper modules can reach the canvas too: `from graph_editor import graph`.
- Graphs stay a separate library: each project **selects any visible graph**
  (yours or a sample) as its test fixture from the picker — the canvas and
  animation playback work exactly like the graph editor, and Run executes the
  currently open file against it.
- Projects and their files are strictly owner-private (RLS; see
  `tests/integration/projects-rls.test.ts`).

## Security model

RLS is the authoritative enforcement layer; app-level checks are UX only.

- Graphs are **private by default** — visible only to their owner unless
  `is_public` is set.
- Only owners can insert/update/delete their rows; `owner_id` and `is_sample`
  are excluded from the column-level grants, so ownership can't be forged or
  transferred even if a policy were loosened.
- Sample graphs are ownerless, public and immutable; anyone can **duplicate**
  one into their own account.
- The isolation matrix is tested against a real local Supabase in
  `tests/integration/rls.test.ts` and runs in CI.

## Local development

```bash
npm install
supabase start          # local Postgres + Auth (Docker)
supabase db reset       # apply migrations + seed sample graphs
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_ANON_KEY (+ SERVICE_ROLE_KEY for tests)
# from `supabase status`
npm run dev
```

- Email sign-in works out of the box (confirmations are off locally; captured
  mail is at the Inbucket URL from `supabase status`).
- GitHub/Google sign-in locally needs OAuth apps with callback
  `http://127.0.0.1:54331/auth/v1/callback` and the
  `SUPABASE_AUTH_EXTERNAL_{GITHUB,GOOGLE}_{CLIENT_ID,SECRET}` env vars set
  before `supabase start`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | unit tests (frame/playback semantics) |
| `npm run test:integration` | RLS isolation matrix (needs `supabase start`) |

Regenerate DB types after schema changes:
`supabase gen types typescript --local > types/database.ts`

## Deployment

**Supabase** (hosted project) + **Vercel** (Git integration), connected by env
vars. Two options for wiring them:

1. **Vercel × Supabase Marketplace integration** (recommended): install the
   [Supabase integration](https://vercel.com/marketplace/supabase) on the
   Vercel project and it provisions/syncs `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` automatically (and keeps them rotated).
   Add `NEXT_PUBLIC_SITE_URL` yourself.
2. **Manual env vars**: copy the values from the Supabase dashboard into
   Vercel → Project → Settings → Environment Variables.

Then:

- **Auth providers**: enable GitHub + Google in Supabase Auth → Providers with
  callback `https://<project-ref>.supabase.co/auth/v1/callback`; set the Site
  URL to the production domain and add `https://<domain>/auth/callback` to the
  redirect allow-list.
- **Migrations**: GitHub Actions applies `supabase db push` on every push to
  `main` (after the verify job passes on a fresh local DB). Set the repo
  secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD`. Until they exist the job skips cleanly.
- **Seed samples in production** (one-time): run the statements from
  `supabase/seed.sql` against the hosted DB (SQL editor or
  `psql`) — `db push` intentionally applies schema only.

## Project layout

```
app/                    pages: / (landing), /graphs (explorer), /graphs/[id]
                        (editor), /login, /auth/callback
components/ui/          shadcn primitives
components/site/        navbar, theme toggle
components/auth/        login form, session-aware auth button
components/graphs/      explorer cards + dialogs
components/editor/      canvas, node, code panel, console, playback
lib/supabase/           browser / server / proxy clients
lib/data/               server reads (RLS-scoped)
lib/actions/            server actions (create/save/delete/duplicate)
lib/editor/             store, frames, python prelude + presets, worker hook
lib/graph/              GraphDoc schema + helpers
public/python-worker.js Pyodide worker (the JS half of the bridge)
supabase/               config.toml, migrations/, seed.sql
tests/                  unit/ (frames), integration/ (RLS matrix)
proxy.ts                session refresh (Next 16's middleware)
```
