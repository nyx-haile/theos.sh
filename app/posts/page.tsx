import Link from "next/link";

export default function PostsIndexPage() {
  return (
    <div className="panel">
      <h1 className="h1">Posts</h1>
      <p>
        Long-form writing will render from Supabase content. During scaffold,
        sample Markdown lives in <code>content.example/posts</code>. The publish
        script will ingest real posts from your private source during CI.
      </p>
      <p>
        Try editing the sample file{" "}
        <code>content.example/posts/2024-01-01-sample.md</code> to validate your
        pipeline.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
