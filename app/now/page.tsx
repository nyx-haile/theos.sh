import Link from "next/link";

export default function NowPage() {
  return (
    <div className="panel">
      <h1 className="h1">Now</h1>
      <p>
        A status page describing what is happening right now. Replace the sample
        content in <code>content.example/pages/now.md</code> when wiring the
        publish script.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
