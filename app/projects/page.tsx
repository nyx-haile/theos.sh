import Link from "next/link";

export default function ProjectsIndexPage() {
  return (
    <div className="panel">
      <h1 className="h1">Projects</h1>
      <p>
        Projects will list work-in-progress and shipped builds. This scaffold
        keeps a placeholder entry in <code>content.example/projects</code> until
        the publish pipeline syncs your real data.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
