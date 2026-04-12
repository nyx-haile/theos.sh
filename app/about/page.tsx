import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="panel">
      <h1 className="h1">About</h1>
      <p>
        This terminal-inspired site is built for accessibility, curl-friendliness,
        and Git-based publishing. No cookies, no analytics, and no required JS for
        reading.
      </p>
      <p>
        Content stays in a private repo by default; forks remain empty until you
        add your own posts. The publish script will sync your private content into
        Supabase during CI.
      </p>
      <Link href="/">Back home</Link>
    </div>
  );
}
