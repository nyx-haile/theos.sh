import Link from "next/link";

export default function NotesIndexPage() {
  return (
    <div className="panel">
      <h1 className="h1">Notes</h1>
      <p>
        Notes are short updates and changelog-style entries. They will be
        fetched server-side from Supabase with text/plain support for curl.
      </p>
      <p>
        Scaffold sample: <code>content.example/notes/2024-01-02-sample-note.md</code>.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
