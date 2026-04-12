# Nyx.dev (scaffold)

TUI-styled, curl-first blog scaffold. No tracking, no required JS, fork-safe publishing into Supabase.

## Quick start

```sh
npm install
npm run dev
```

Env variables (`.env`):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (needed for publish script; not used client-side)

## Content

Sample Markdown lives in `content.example/` to keep forks empty of private material. Real content should be injected from a private source during CI and published into Supabase.

## Docs

- PRD: `docs/PRD.md`
- Project plan: `docs/PLAN.md`
