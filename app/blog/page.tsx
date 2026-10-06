import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/src/lib/blog";

export const metadata: Metadata = {
  title: "FarmVoice Blog",
  description:
    "Practical guides on farm recordkeeping, pesticide compliance, H-2A workforce management, and payroll preparation.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="container section stack">
      <div className="kicker">Resources &amp; Guides</div>
      <h1>FarmVoice Blog</h1>
      <p className="lede">
        Practical guides on pesticide records, H-2A compliance, crew time, and
        farm payroll preparation.
      </p>

      {posts.length === 0 ? (
        <p className="muted">No articles yet — check back soon.</p>
      ) : (
        <div className="blog-list">
          {posts.map((post) => (
            <article key={post.slug} className="blog-card card">
              <div className="blog-meta">
                <span className="badge">{post.tags[0]}</span>
                <time className="blog-date" dateTime={post.date}>
                  {new Date(post.date + "T12:00:00").toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              </div>
              <h2 className="blog-card-title">
                <Link href={`/blog/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="blog-excerpt">{post.excerpt}</p>
              <Link className="blog-read-link" href={`/blog/${post.slug}`}>
                Read article →
              </Link>
            </article>
          ))}
        </div>
      )}

      <style>{`
        .blog-list { display: grid; gap: 18px; }
        .blog-card { display: grid; gap: 10px; }
        .blog-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .blog-date { font-size: 13px; color: var(--muted); }
        .blog-card-title { font-size: 22px; margin: 0; letter-spacing: -.02em; }
        .blog-card-title a { color: var(--ink); }
        .blog-card-title a:hover { color: var(--brand); }
        .blog-excerpt { color: var(--muted); margin: 0; }
        .blog-read-link { font-weight: 700; color: var(--brand-dark); font-size: 14px; }
        @media (min-width: 680px) {
          .blog-list { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </main>
  );
}
