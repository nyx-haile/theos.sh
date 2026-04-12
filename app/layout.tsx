import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nyx.dev — TUI-styled, curl-first blog",
  description:
    "Accessible, terminal-inspired blog for posts, notes, projects, and resources. No tracking, curl-friendly, and Git-published.",
  metadataBase: new URL("https://nyx.dev")
};

const navLinks = [
  { href: "/", label: "home" },
  { href: "/posts", label: "posts" },
  { href: "/notes", label: "notes" },
  { href: "/projects", label: "projects" },
  { href: "/tags", label: "tags" },
  { href: "/series", label: "series" },
  { href: "/now", label: "now" },
  { href: "/about", label: "about" },
  { href: "/search", label: "search" }
];

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="theme-solarized">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="page">
          <header className="header" role="banner">
            <div className="brand-block">
              <div className="brand-title">nyx.dev</div>
              <p className="brand-subtitle">
                TUI-styled blog for hackers, artists, and builders. No tracking.
              </p>
            </div>
            <nav aria-label="Primary" className="nav">
              <ul>
                {navLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <main id="main" className="main" role="main">
            {children}
          </main>
          <footer className="footer" role="contentinfo">
            <p>
              No cookies. No analytics. Built for curl, keyboard, and readers.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
