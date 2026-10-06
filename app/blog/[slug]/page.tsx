import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/src/lib/blog";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, type: "article", publishedTime: post.date },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const displayDate = new Date(post.date + "T12:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="container section">
      <nav className="blog-breadcrumb">
        <Link href="/blog">← Blog</Link>
      </nav>

      <article className="blog-article stack">
        <header className="blog-article-head">
          <div className="blog-article-meta">
            {post.tags.map((tag) => (
              <span key={tag} className="badge">{tag}</span>
            ))}
            <time dateTime={post.date}>{displayDate}</time>
          </div>
          <h1>{post.title}</h1>
          <p className="lede">{post.excerpt}</p>
        </header>

        <div className="blog-body stack">
          {post.sections.map((section, i) => (
            <section key={i}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        <footer className="blog-cta card">
          <div className="kicker">Ready to simplify farm records?</div>
          <h2>Try FarmVoice Records free for 14 days</h2>
          <p>
            Voice-first records, pesticide compliance checks, crew time, H-2A
            documentation, and QuickBooks integration. No card required.
          </p>
          <div className="actions">
            <Link className="btn" href="/signup">Start free trial</Link>
            <Link className="btn secondary" href="/billing">See pricing</Link>
          </div>
        </footer>
      </article>

      <style>{`
        .blog-breadcrumb { margin-bottom: 28px; font-size: 14px; }
        .blog-breadcrumb a { color: var(--brand-dark); font-weight: 700; }
        .blog-article-head { display: grid; gap: 12px; }
        .blog-article-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
        .blog-article h1 { font-size: clamp(28px, 5vw, 44px); letter-spacing: -.04em; line-height: 1.1; }
        .blog-body h2 { font-size: 20px; letter-spacing: -.02em; margin-bottom: 8px; }
        .blog-body p { color: var(--muted); }
        .blog-cta { margin-top: 14px; }
        .blog-cta h2 { font-size: 22px; }
        @media (min-width: 760px) {
          .blog-article { max-width: 720px; }
        }
      `}</style>
    </main>
  );
}
