import Link from "next/link";

export default function SearchPage() {
  return (
    <div className="panel">
      <h1 className="h1">Search</h1>
      <p>
        Server-side search will query Supabase full-text indexes and return both
        HTML and text/plain responses. This placeholder keeps the route and
        accessible form ready.
      </p>
      <form method="get" action="/search" className="stack gap">
        <label htmlFor="q" className="eyebrow">
          Query
        </label>
        <input
          id="q"
          name="q"
          type="search"
          required
          placeholder="vim, accessibility, projects..."
          className="input"
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>
      <p>
        Use <code>?format=txt</code> or <code>Accept: text/plain</code> to fetch
        curl-friendly output.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
