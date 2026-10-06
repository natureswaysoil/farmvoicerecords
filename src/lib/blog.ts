import fs from 'fs'
import path from 'path'

export type BlogPost = {
  slug: string
  title: string
  date: string
  excerpt: string
  author: string
  tags: string[]
  sections: Array<{ heading: string; body: string }>
}

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.json'))
  const posts = files
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8')
        return JSON.parse(raw) as BlogPost
      } catch {
        return null
      }
    })
    .filter(Boolean) as BlogPost[]
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): BlogPost | null {
  const all = getAllPosts()
  return all.find((p) => p.slug === slug) ?? null
}
