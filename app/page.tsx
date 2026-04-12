import Link from "next/link";

const quickLinks = [
  {
    href: "/posts",
    title: "Read posts",
    detail: "Long-form writing with server-rendered code blocks."
  },
  {
    href: "/notes",
    title: "Browse notes",
    detail: "Short updates and changelog-style entries."
  },
  {
    href: "/projects",
    title: "Projects",
    detail: "Work-in-progress and shipped builds with links out."
  },
  {
    href: "/search",
    title: "Search",
    detail: "Server-side search across posts, notes, projects, and pages."
  }
];

export default function HomePage() {
  return (
    <div className="stack gap">
      <section className="panel">
        <p className="eyebrow">curl-first / keyboard-first</p>
        <h1 className="h1">Terminal-inspired publishing</h1>
        <p className="lede">
          A TUI-styled blog for hackers, artists, and builders. Built to be read
          without JavaScript, tracked pixels, or external calls. Publish from
          Git; render from Supabase; stay friendly to curl.
        </p>
        <div className="grid two">
          {quickLinks.map((item) => (
            <div key={item.href} className="card">
              <h2 className="h3">
                <Link href={item.href}>{item.title}</Link>
              </h2>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Fork-safe publishing</h2>
        <p>
          This repo ships with sample content only. Real posts live in a private
          content source pulled during CI and published into Supabase, so forks
          stay empty until you add your own material.
        </p>
        <Link href="/about" className="inline-link">
          Read more about the setup
        </Link>
      </section>

      <section className="panel">
        <h2 className="h2">Accessibility baseline</h2>
        <ul className="list">
          <li>Semantic landmarks with skip link and high-contrast focus states.</li>
          <li>Text/plain output via Accept header or <code>?format=txt</code>.</li>
          <li>No cookies, no analytics, no third-party beacons.</li>
          <li>Optional command mode stays opt-in and respectful of inputs.</li>
        </ul>
      </section>
    </div>
  );
}
