import Link from "next/link";

export default function SeriesIndexPage() {
  return (
    <div className="panel">
      <h1 className="h1">Series</h1>
      <p>
        Series group related posts and notes. This placeholder keeps routing and
        accessibility in place while Supabase integration is wired up.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
