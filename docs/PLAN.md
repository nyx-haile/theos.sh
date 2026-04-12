# Project Plan (MVP)

## Immediate setup
- Scaffold Next.js App Router project (no client JS requirements) with Solarized design tokens and semantic layout + skip links.
- Add Supabase client/server helpers and check in SQL for schema + RLS matching `content_items` and Storage usage.
- Create `content.example/` with sample posts/notes/projects/pages to keep forks empty of private content.

## Publishing pipeline
- Build markdown parser/validator (frontmatter required fields, image alt enforcement, heading order lint).
- Derive metadata (slug, reading time, excerpt, optional TOC) and server-side code highlighting.
- Publish script: upload assets to Supabase Storage, upsert rows into `content_items`, compute `search_vector`; driven by CI with private content source.

## Runtime features
- SSR routes for home/posts/notes/projects/tags/series/now/about with text/plain variants via `?format=txt` or Accept header.
- Server-side search route hitting Supabase FTS with sensible ranking; text/plain output supported.
- Related links logic (explicit `links` + tag/series overlap); GitHub link cards cached in metadata.
- Feeds: RSS, Atom, JSON Feed (summaries by default).

## Progressive enhancement
- Optional command mode (Esc → `:` prompt) implemented with accessible `<dialog>`; no key hijack when forms focused; works only when JS enabled.
- Theme handling: Solarized default; consider high-contrast variant honoring `prefers-reduced-motion`.

## Delivery checkpoints
- Foundation scaffolding + schema/RLS committed.
- Publish/validate scripts working against sample content.
- Core pages + text/plain mode + feeds + search shipped.
- Command mode enhancement shipped with accessibility QA and curl tests.
