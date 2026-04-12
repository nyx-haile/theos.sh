# TUI Blog PRD

Owner: Bella (PM)  
Stakeholders: You (director/author), future contributors via PRs  
Target launch: MVP (single-author) with optional multi-author via PRs

## 1) Summary

You want a TUI-styled blog/resource site for hackers/artists/makers/devs/queer folks that is:

- Readable and usable with zero JS
- No tracking, no cookies, no cross-site requests
- Curl-friendly with a dedicated plain-text representation
- Keyboard-first with a Vim-like command mode
- Git-based publishing (PRs welcome), with no admin UI
- Deployed on Vercel, with Supabase as the runtime content DB and asset storage

Key architectural constraint: the project must be forkable without forks automatically downloading/publishing your personal content.

## 2) Goals and non-goals

### Goals

- Publish and browse long posts, short notes, projects, now, about, and a Mastodon link.
- “Maximally accessible” (baseline: WCAG 2.2 AA) while keeping a terminal aesthetic.
- No required JS for reading, navigation, or search.
- Text/plain output for curl/terminal usage (B2).
- Server-side search across posts/notes/projects/pages.
- Feed outputs: RSS, Atom, and JSON Feed.
- Safe forkability: forking the repo does not include your content by default.

### Non-goals (MVP)

- Comments (explicitly out of scope)
- Analytics, tracking, cookie banners (none)
- SEO optimization (not a priority; still keep sane metadata)
- Real-time features, personalization, accounts for readers
- Rich embed support beyond GitHub-friendly linking/cards

## 3) Primary users and use cases

Primary user: You (author)

- Write in Markdown locally, push PR/commit, publish.
- Organize content via tags/series, link posts together.
- Maintain a projects index and occasional changelog-like notes.

Secondary user: Readers (hackers/devs/etc.)

- Browse with browser or curl.
- Navigate quickly with keyboard.
- Read code-heavy posts with good semantics and contrast.

Tertiary user: Forkers

- Fork and deploy their own instance without pulling your content.
- Opt-in to their own content via their own Supabase + content folder.

## 4) UX principles

- Progressive enhancement: HTML-first; JS only for optional niceties.
- Command mode (C2): keyboard shortcuts only after explicit activation (protects accessibility and text inputs).
- No external requests by default: no third-party fonts, scripts, analytics, embeds that beacon.
- Solarized default, modern monospace, high-contrast-compliant.
- Everything reachable via plain links even if command palette exists.

## 5) Information architecture and routes

Core routes (HTML)

- `/` home (latest posts + latest notes + quick links)
- `/posts` index
- `/posts/[slug]`
- `/notes` index
- `/notes/[slug]`
- `/projects` index
- `/projects/[slug]`
- `/tags` + `/tags/[tag]`
- `/series` + `/series/[series]`
- `/now`
- `/about`
- `/search?q=...` (server-rendered results)
- `/feeds/rss.xml`, `/feeds/atom.xml`, `/feeds/feed.json`

Text equivalents (curl-first)

For each readable page above, provide a text route:

- Same path + `?format=txt` and/or content negotiation:
- If `Accept: text/plain`, return text/plain version.

Examples:

- `/posts/my-post?format=txt`
- `/search?q=vim&format=txt`

Acceptance: `curl -H "Accept: text/plain" https://site/posts/...` produces a readable text page without HTML noise.

## 6) Content model

Authoring format (Git)

- Markdown files with frontmatter.
- Posts: `content/posts/YYYY-MM-DD-slug.md`
- Notes: `content/notes/YYYY-MM-DD-slug.md`
- Projects: `content/projects/slug.md` (or `.yml` + markdown body)
- Pages: `content/pages/about.md`, `content/pages/now.md`

Frontmatter fields (minimum):

- `title` (required)
- `date` (required)
- `type` (`post|note|project|page`)
- `tags` (array)
- `series` (array or single)
- `summary` (optional but recommended)
- `draft` (optional boolean)
- `canonical` (optional)
- `updated` (optional date)
- `links` (optional array of related slugs/urls)

Content requirements:

- Images must include alt text (enforced via linting or build validation).
- Code blocks supported; highlighting must be server-side.

## 7) Publishing workflow and fork safety

Desired workflow (MVP)

- Author writes Markdown in git.
- On main branch deploy/build:
  - Parse/validate content.
  - Generate derived fields (reading time, excerpt, TOC if desired).
  - Upload images to Supabase Storage (or keep in repo if you prefer; but Storage aligns with keeping content out of forks).
  - Upsert content rows into Supabase DB.
- The deployed site reads content from Supabase at runtime.

Forkability requirement

- The repo should not contain your content by default.

Implement one of these patterns (MVP recommendation: Pattern P1):

- **P1: Private content repo + public site repo**
  - Public repo: site code + sample content only.
  - Your content lives in a separate private repo (or local), synced during CI.
  - Public forks never see your content.
- **P2: Content submodule ignored by default**
  - Public repo includes `content.example/` and expects users to add their own `content/`.
  - Your real `content/` is not in the public repo.

Acceptance criteria (fork safety):

- A fork + deploy of the public repo results in either:
  - an empty site with sample content, or
  - a setup screen/instructions page,
  - but never your real posts.

## 8) Features and requirements

### 8.1 TUI look-and-feel

- Solarized theme default.
- Monospace “modern” font stack:
  - system mono first, optional bundled woff2 (self-hosted only).
- Terminal-like layout without breaking semantic HTML:
  - headings are real `<h1-h6>`, lists are `<ul>`, etc.
- Minimal UI chrome; “neofetch-ish” header block on home/about.

Acceptance:

- Lighthouse accessibility score high (target ≥ 95) without JS.
- No external network requests on page load (other than your own domain + Supabase if needed server-side).

### 8.2 Navigation + organization

- Tags and series indexes.
- “Related” section per post driven by links, shared tags/series, or both.
- Changelog-like “notes” feed.

Acceptance:

- Tag and series pages render even with JS disabled.
- Related links are plain anchors.

### 8.3 Server-side search (E3 + F1)

- Search box submits to `/search?q=....`
- Results include posts, notes, projects, and pages.
- Ranking: reasonable default (title match > tags > body match; newest bias optional).

Implementation note:

- Use Postgres full-text search (tsvector) in Supabase, or precomputed search index table.

Acceptance:

- Search works via curl using `?format=txt` and via browser without JS.

### 8.4 Vim-style command mode (C2 + D2)

- Default: no global keybindings.
- Press `Esc` (or configurable key) to enter “command mode”.
- In command mode:
  - `:` opens command prompt
  - commands supported (MVP):
    - `:home`, `:posts`, `:notes`, `:projects`, `:tags`, `:series`, `:now`, `:about`
    - `:open <slug|url>`
    - `:search <query>`
    - `:theme <name>` (optional enhancement)
    - `:help`
- Command UI must be accessible:
  - rendered as a real `<dialog>` or semantic region
  - focus trapped while open
  - announced to screen readers
  - escape closes and returns focus
- No-JS requirement handling:
  - Command mode is optional enhancement. If JS is off, all navigation still exists via links/forms.

Acceptance:

- With JS off: site remains fully usable.
- With JS on: command mode works and never hijacks typing in inputs/contenteditable, and can be disabled.

### 8.5 Embeds (GitHub-focused, no JS required)

- Default behavior: render external links as link cards (title + domain + optional description).
- GitHub support (MVP):
  - Detect GitHub repo links and render a server-generated card:
    - repo name, description, stars, primary language, last updated
  - Source of data: build-time fetch from GitHub API OR scraping Open Graph at build (no runtime calls required)

Acceptance:

- A post containing a GitHub link displays a readable card without client JS.
- If GitHub API fails, fallback is just a normal link.

### 8.6 Feeds

- RSS, Atom, JSON Feed for posts and optionally notes.
- Include full content or summaries (your choice; MVP: summaries + link, with an option to switch).

Acceptance:

- All feeds validate with common validators and include correct dates/titles/links.

## 9) Accessibility requirements (baseline: WCAG 2.2 AA)

Must-haves

- Semantic landmarks (`header`, `nav`, `main`, `footer`)
- Skip to content
- Visible focus styles (high contrast)
- No color-only meaning
- Respects `prefers-reduced-motion`
- Text scaling without layout breaking
- Keyboard navigation works without JS

Command mode:

- opt-in activation
- accessible dialog semantics
- never steals keystrokes from form fields

Content authoring guidelines (enforced)

- Every image requires alt text (build fails otherwise unless explicitly `alt: ""` for decorative).
- Heading structure lint (no skipping levels ideally).
- Link text should be descriptive (warn, don’t fail).

## 10) Data & backend (Supabase)

Tables (conceptual)

- `content_items`
  - `id` (uuid)
  - `type` (`post|note|project|page`)
  - `slug` (unique per type or globally unique)
  - `title`
  - `summary`
  - `body_markdown`
  - `body_html` (optional pre-rendered)
  - `published_at`
  - `updated_at`
  - `tags` (text[])
  - `series` (text[])
  - `draft` (bool)
  - `search_vector` (tsvector)
  - `metadata` (jsonb) — extra fields (reading_time, toc, github_cards, etc.)
- `assets` (optional if not relying solely on Storage metadata)
  - path, alt, caption, width, height, etc.

Auth / permissions

- Supabase Auth exists only to allow “publisher” actions from CI or a minimal admin.
- RLS:
  - Public can select only where `draft = false`.
  - Only service role (CI) can insert/update/delete.

Storage

- Supabase Storage bucket for images (public or private + signed URLs; MVP likely public since it’s a public resource).
- No third-party image CDNs required.

## 11) Performance and privacy constraints

### Privacy

- No cookies.
- No analytics scripts.
- Avoid third-party assets; self-host fonts if any.
- Avoid external embeds that cause background requests; default to link cards.

### Performance

- SSR pages cached where possible (Vercel caching headers).
- Search queries are server-side; rate limit if needed (basic).

## 12) Technical approach (implementation-neutral but concrete)

### Recommended stack (fits Vercel well)

- Next.js (App Router) or Astro with server rendering
- Markdown processing at build time for publish step
- Server-side syntax highlighting (Shiki or similar) baked into HTML or rendered on request
- Supabase Postgres FTS for search

### Build & publish pipeline

- A “publish” script runs on deploy:
  - reads `content/` from the publishing source (private repo/submodule/local)
  - validates markdown/frontmatter
  - uploads images to Storage
  - upserts rows in Supabase
- Vercel build uses env vars:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (publish only; never exposed client-side)

### Runtime

- Server reads from Supabase using anon key (read-only public endpoints) or server-side key with RLS-safe selects.
- Absolutely no requirement for client JS.

## 13) MVP acceptance criteria checklist

### Publishing / fork safety

- Public repo contains no private content.
- Fork + deploy shows sample content or empty state.
- Your deploy publishes content from your private source into Supabase.

### Reading experience

- JS disabled: all pages navigable, readable, searchable.
- curl text mode works via `Accept: text/plain` and/or `?format=txt`.

### Accessibility

- Keyboard-only navigation works everywhere.
- Command mode is opt-in and accessible (focus management, escape closes, no key hijacking in inputs).
- Contrast meets AA in default Solarized theme (or provide an “HC Solarized” variant).

### Features

- Posts, notes, projects, now/about pages exist.
- Tags + series pages exist.
- Server-side search across all content types.
- RSS/Atom/JSON Feed generated.
- GitHub link cards render server-side with fallback.

### Privacy

- No cookies.
- No analytics.
- No third-party requests by default.

## 14) Suggested delivery plan (milestones)

### Foundation

- Routing + layout + theme tokens (Solarized)
- Content DB schema + RLS
- Basic SSR pages from Supabase

### Publishing pipeline

- Markdown parser + validator
- Git→Supabase publish script
- Storage upload for images

### Content features

- Tags/series, related links
- Syntax highlighting server-side
- Feeds

### Curl mode

- `text/plain` rendering + negotiation
- Text templates optimized for terminal readability

### Search

- Postgres FTS + `/search`
- Text mode search output

### Command mode (progressive enhancement)

- Esc to enter mode, `:` command prompt, `:help`
- Strict accessibility QA

### GitHub niceties

- Build-time GitHub metadata cards (minimal, resilient)

## 15) Open questions (non-blocking; can be decided later)

- Whether to include a “high contrast” theme variant as default toggle (recommended).
- Whether feeds include full content or summaries.
- Whether to implement optional JS instant search (you don’t need it for MVP).
