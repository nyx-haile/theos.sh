import Link from "next/link";

export default function TagsIndexPage() {
  return (
    <div className="panel">
      <h1 className="h1">Tags</h1>
      <p>
        Tag pages will group posts, notes, and projects. Data will be served
        from Supabase with server-side rendering and curl-friendly output.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
