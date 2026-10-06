/**
 * Post the latest FarmVoice blog article to Facebook, Instagram, and Twitter/X.
 *
 * Required environment variables:
 *   FACEBOOK_ACCESS_TOKEN   - Page access token with pages_manage_posts scope
 *   FACEBOOK_PAGE_ID        - Facebook Page ID
 *   INSTAGRAM_ACCESS_TOKEN  - Instagram Graph API token (same as Facebook Page token)
 *   INSTAGRAM_USER_ID       - Instagram Business Account ID
 *   TWITTER_API_KEY         - Twitter API v2 key
 *   TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN
 *   TWITTER_ACCESS_TOKEN_SECRET
 *   SITE_URL                - e.g. https://farmvoicerecords.com (default)
 *
 * Usage:
 *   npx tsx scripts/post-blog-to-social.ts
 *   SLUG=rup-pesticide-record-requirements npx tsx scripts/post-blog-to-social.ts
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')
const SITE_URL = (process.env.SITE_URL || 'https://farmvoicerecords.com').replace(/\/$/, '')

type BlogPost = {
  slug: string
  title: string
  date: string
  excerpt: string
  author: string
  tags: string[]
  sections: Array<{ heading: string; body: string }>
}

function loadPost(slug?: string): BlogPost {
  if (!fs.existsSync(BLOG_DIR)) throw new Error('content/blog/ directory not found')
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.json')).sort().reverse()
  if (files.length === 0) throw new Error('No blog posts found in content/blog/')

  if (slug) {
    const match = files.find((f) => f.includes(slug))
    if (!match) throw new Error(`No post matching slug: ${slug}`)
    return JSON.parse(fs.readFileSync(path.join(BLOG_DIR, match), 'utf-8'))
  }

  // Latest post
  return JSON.parse(fs.readFileSync(path.join(BLOG_DIR, files[0]), 'utf-8'))
}

// ── Facebook ────────────────────────────────────────────────────────────────

async function postToFacebook(post: BlogPost): Promise<void> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN
  const pageId = process.env.FACEBOOK_PAGE_ID
  if (!token || !pageId) { console.log('  Facebook: skipped (missing FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ID)'); return }

  const url = `${SITE_URL}/blog/${post.slug}`
  const message = `${post.title}\n\n${post.excerpt}\n\n${post.tags.map(t => `#${t.replace(/[^a-zA-Z0-9]/g, '')}`).join(' ')}\n\nRead more → ${url}`

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, link: url, access_token: token }),
  })

  const data: any = await res.json()
  if (data.error) throw new Error(`Facebook error: ${data.error.message}`)
  console.log(`  Facebook: posted (id ${data.id})`)
}

// ── Instagram (text post via container API) ──────────────────────────────────

async function postToInstagram(post: BlogPost): Promise<void> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  const userId = process.env.INSTAGRAM_USER_ID
  if (!token || !userId) { console.log('  Instagram: skipped (missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID)'); return }

  const url = `${SITE_URL}/blog/${post.slug}`
  const caption = `${post.title}\n\n${post.excerpt}\n\nLink in bio → farmvoicerecords.com\n\n${post.tags.map(t => `#${t.replace(/[^a-zA-Z0-9]/g, '')}`).join(' ')} #farmrecords #agriculture`

  // Step 1: Create media container (text-only posts use image_url or caption-only carousel)
  // Instagram requires an image for feed posts. Use the FarmVoice OG image as the visual.
  const imageUrl = `${SITE_URL}/opengraph-image`

  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  })
  const container: any = await containerRes.json()
  if (container.error) throw new Error(`Instagram container error: ${container.error.message}`)

  // Step 2: Publish container
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  })
  const publish: any = await publishRes.json()
  if (publish.error) throw new Error(`Instagram publish error: ${publish.error.message}`)
  console.log(`  Instagram: posted (id ${publish.id})`)
}

// ── Twitter / X ──────────────────────────────────────────────────────────────

function oauthHeader(method: string, url: string, params: Record<string, string>): string {
  const apiKey = process.env.TWITTER_API_KEY!
  const apiSecret = process.env.TWITTER_API_SECRET!
  const token = process.env.TWITTER_ACCESS_TOKEN!
  const tokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = String(Math.floor(Date.now() / 1000))

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: token,
    oauth_version: '1.0',
  }

  const allParams = { ...params, ...oauthParams }
  const sortedKeys = Object.keys(allParams).sort()
  const paramString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&')
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  oauthParams['oauth_signature'] = signature
  const headerParts = Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
  return `OAuth ${headerParts.join(', ')}`
}

async function postToTwitter(post: BlogPost): Promise<void> {
  const apiKey = process.env.TWITTER_API_KEY
  if (!apiKey) { console.log('  Twitter: skipped (missing TWITTER_API_KEY)'); return }

  const url = `${SITE_URL}/blog/${post.slug}`
  // Keep tweet under 280 chars
  let text = `${post.title} — ${url}`
  if (text.length > 270) {
    text = `${post.title.slice(0, 200)}… — ${url}`
  }

  const tweetUrl = 'https://api.twitter.com/2/tweets'
  const body = JSON.stringify({ text })
  const authHeader = oauthHeader('POST', tweetUrl, {})

  const res = await fetch(tweetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body,
  })
  const data: any = await res.json()
  if (data.errors || !data.data?.id) throw new Error(`Twitter error: ${JSON.stringify(data.errors || data)}`)
  console.log(`  Twitter: posted (id ${data.data.id})`)
}

// ── AgFuse (web post via form submission — no public API) ────────────────────

async function noteAgFuse(post: BlogPost): Promise<void> {
  const url = `${SITE_URL}/blog/${post.slug}`
  console.log(`  AgFuse: post manually at https://agfuse.com`)
  console.log(`    Title: ${post.title}`)
  console.log(`    Link:  ${url}`)
  console.log(`    Tags:  ${post.tags.join(', ')}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const slug = process.env.SLUG?.trim()
  const post = loadPost(slug)
  console.log(`Posting: "${post.title}" (${post.date})`)
  console.log(`URL: ${SITE_URL}/blog/${post.slug}`)
  console.log()

  await postToFacebook(post).catch((e) => console.error(`  Facebook error: ${e.message}`))
  await postToInstagram(post).catch((e) => console.error(`  Instagram error: ${e.message}`))
  await postToTwitter(post).catch((e) => console.error(`  Twitter error: ${e.message}`))
  await noteAgFuse(post)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
