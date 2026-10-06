/**
 * Post the latest FarmVoice blog article to:
 *   - FarmVoice Facebook Page
 *   - Facebook farming groups (via publish_to_groups permission)
 *   - Instagram
 *   - Twitter/X
 *   - LinkedIn (company page)
 *   - AgFuse (manual — no public API)
 *
 * Required environment variables:
 *   FACEBOOK_ACCESS_TOKEN        - Page/User token; needs pages_manage_posts + publish_to_groups
 *   FACEBOOK_PAGE_ID             - Numeric ID of the FarmVoice Facebook Page
 *   INSTAGRAM_ACCESS_TOKEN       - Instagram Graph API token (same as Facebook token)
 *   INSTAGRAM_USER_ID            - Instagram Business Account ID
 *   TWITTER_API_KEY / TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_TOKEN_SECRET
 *   LINKEDIN_ACCESS_TOKEN        - OAuth 2.0 token with w_member_social or w_organization_social
 *   LINKEDIN_AUTHOR_URN          - urn:li:organization:XXXXXXX or urn:li:person:XXXXXXX
 *   SITE_URL                     - e.g. https://farmvoicerecords.com (default)
 *
 * Facebook group IDs — find by visiting the group on Facebook and checking the URL:
 *   facebook.com/groups/<GROUP_ID>
 * Then set them in FACEBOOK_GROUPS below, or override via FACEBOOK_GROUP_IDS env var
 * (comma-separated numeric IDs).
 *
 * Usage:
 *   npx tsx scripts/post-blog-to-social.ts
 *   SLUG=h2a-worker-departure-checklist npx tsx scripts/post-blog-to-social.ts
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')
const SITE_URL = (process.env.SITE_URL || 'https://farmvoicerecords.com').replace(/\/$/, '')

// ── Facebook group targets ────────────────────────────────────────────────────
// To find a group's numeric ID: go to the group on Facebook → the URL will be
// facebook.com/groups/<numeric-id>  OR  use facebook.com/groups/<name>?id=<numeric-id>
// Replace the empty string '' with the real numeric ID once you have it.
const FACEBOOK_GROUPS: Array<{ name: string; id: string }> = [
  { name: 'Farmers of America',                    id: process.env.FB_GROUP_FARMERS_OF_AMERICA    || '' },
  { name: 'Agricultural Producers & Farmers',       id: process.env.FB_GROUP_AG_PRODUCERS          || '' },
  { name: 'FarmingUK Community',                    id: process.env.FB_GROUP_FARMINGUK             || '' },
  { name: 'US Farmers & Ranchers',                  id: process.env.FB_GROUP_US_FARMERS_RANCHERS   || '' },
  { name: 'Pesticide Applicators & Ag Compliance',  id: process.env.FB_GROUP_PESTICIDE_COMPLIANCE  || '' },
  { name: 'H-2A Farm Labor Forum',                  id: process.env.FB_GROUP_H2A_LABOR             || '' },
  { name: 'Farm Record Keeping & Compliance',       id: process.env.FB_GROUP_FARM_RECORDS          || '' },
  { name: 'Successful Farming Community',           id: process.env.FB_GROUP_SUCCESSFUL_FARMING    || '' },
  // Add more groups here
]

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
  return JSON.parse(fs.readFileSync(path.join(BLOG_DIR, files[0]), 'utf-8'))
}

function hashtags(post: BlogPost): string {
  return post.tags.map(t => `#${t.replace(/[^a-zA-Z0-9]/g, '')}`).join(' ')
}

// ── Facebook Page ─────────────────────────────────────────────────────────────

async function postToFacebookPage(post: BlogPost): Promise<void> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN
  const pageId = process.env.FACEBOOK_PAGE_ID
  if (!token || !pageId) {
    console.log('  Facebook Page: skipped (missing FACEBOOK_ACCESS_TOKEN or FACEBOOK_PAGE_ID)')
    return
  }
  const url = `${SITE_URL}/blog/${post.slug}`
  const message = `${post.title}\n\n${post.excerpt}\n\n${hashtags(post)}\n\nRead more → ${url}`
  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, link: url, access_token: token }),
  })
  const data: any = await res.json()
  if (data.error) throw new Error(`Facebook Page error: ${data.error.message}`)
  console.log(`  Facebook Page: posted (id ${data.id})`)
}

// ── Facebook Groups ───────────────────────────────────────────────────────────
// Requires publish_to_groups permission on the access token AND the token holder
// must be a member of each group. Groups with empty IDs are printed for manual posting.

async function postToFacebookGroups(post: BlogPost): Promise<void> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN
  const url = `${SITE_URL}/blog/${post.slug}`
  const message = `${post.title}\n\n${post.excerpt}\n\n${hashtags(post)}\n\nFull article → ${url}`

  // Allow runtime override of group IDs via env var (comma-separated)
  const envOverride = process.env.FACEBOOK_GROUP_IDS
  const runtimeGroups = envOverride
    ? envOverride.split(',').map((id, i) => ({ name: `Group ${i + 1}`, id: id.trim() }))
    : FACEBOOK_GROUPS

  const withId    = runtimeGroups.filter(g => g.id)
  const withoutId = runtimeGroups.filter(g => !g.id)

  if (!token) {
    console.log('  Facebook Groups: skipped (missing FACEBOOK_ACCESS_TOKEN)')
    printManualGroupCopy(withoutId, post, url)
    return
  }

  for (const group of withId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${group.id}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, link: url, access_token: token }),
      })
      const data: any = await res.json()
      if (data.error) {
        // Permission denied or not a member — fall back to manual
        console.log(`  Facebook Group "${group.name}": needs manual post (${data.error.message})`)
        printManualGroupEntry(group.name, post, url)
      } else {
        console.log(`  Facebook Group "${group.name}": posted (id ${data.id})`)
      }
    } catch (e: any) {
      console.log(`  Facebook Group "${group.name}": error — ${e.message}`)
    }
  }

  if (withoutId.length > 0) {
    console.log(`\n  Facebook Groups without IDs — post manually:`)
    printManualGroupCopy(withoutId, post, url)
  }
}

function printManualGroupEntry(name: string, post: BlogPost, url: string) {
  console.log(`    → ${name}`)
  console.log(`      "${post.title}"`)
  console.log(`       ${url}`)
}

function printManualGroupCopy(groups: Array<{ name: string; id: string }>, post: BlogPost, url: string) {
  if (groups.length === 0) return
  console.log('  ─────────────────────────────────────────────')
  console.log('  MANUAL POST COPY (paste into each group):')
  console.log(`  "${post.title}"`)
  console.log(`  ${post.excerpt}`)
  console.log(`  ${hashtags(post)}`)
  console.log(`  Read more → ${url}`)
  console.log('  Groups to post to:')
  for (const g of groups) console.log(`    • ${g.name}`)
  console.log('  ─────────────────────────────────────────────')
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function postToInstagram(post: BlogPost): Promise<void> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  const userId = process.env.INSTAGRAM_USER_ID
  if (!token || !userId) {
    console.log('  Instagram: skipped (missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID)')
    return
  }
  const url = `${SITE_URL}/blog/${post.slug}`
  const caption = `${post.title}\n\n${post.excerpt}\n\nLink in bio → farmvoicerecords.com\n\n${hashtags(post)} #farmrecords #agriculture`
  const imageUrl = `${SITE_URL}/opengraph-image`

  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  })
  const container: any = await containerRes.json()
  if (container.error) throw new Error(`Instagram container error: ${container.error.message}`)

  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: token }),
  })
  const publish: any = await publishRes.json()
  if (publish.error) throw new Error(`Instagram publish error: ${publish.error.message}`)
  console.log(`  Instagram: posted (id ${publish.id})`)
}

// ── Twitter / X ───────────────────────────────────────────────────────────────

function oauthHeader(method: string, url: string, params: Record<string, string>): string {
  const apiKey    = process.env.TWITTER_API_KEY!
  const apiSecret = process.env.TWITTER_API_SECRET!
  const token     = process.env.TWITTER_ACCESS_TOKEN!
  const tokenSec  = process.env.TWITTER_ACCESS_TOKEN_SECRET!
  const nonce     = crypto.randomBytes(16).toString('hex')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey, oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: timestamp,
    oauth_token: token, oauth_version: '1.0',
  }
  const allParams   = { ...params, ...oauthParams }
  const sortedKeys  = Object.keys(allParams).sort()
  const paramString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&')
  const baseString  = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
  const signingKey  = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(tokenSec)}`
  const signature   = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')
  oauthParams['oauth_signature'] = signature
  return `OAuth ${Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ')}`
}

async function postToTwitter(post: BlogPost): Promise<void> {
  if (!process.env.TWITTER_API_KEY) { console.log('  Twitter: skipped (missing TWITTER_API_KEY)'); return }
  const url     = `${SITE_URL}/blog/${post.slug}`
  let text = `${post.title} — ${url}`
  if (text.length > 270) text = `${post.title.slice(0, 200)}… — ${url}`
  const tweetUrl = 'https://api.twitter.com/2/tweets'
  const res = await fetch(tweetUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: oauthHeader('POST', tweetUrl, {}) },
    body: JSON.stringify({ text }),
  })
  const data: any = await res.json()
  if (data.errors || !data.data?.id) throw new Error(`Twitter error: ${JSON.stringify(data.errors || data)}`)
  console.log(`  Twitter: posted (id ${data.data.id})`)
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
// Requires: LinkedIn Marketing Developer Platform access
//   LINKEDIN_ACCESS_TOKEN  - OAuth 2.0 token with w_organization_social (company) or w_member_social (personal)
//   LINKEDIN_AUTHOR_URN    - urn:li:organization:XXXXXXX  OR  urn:li:person:XXXXXXX

async function postToLinkedIn(post: BlogPost): Promise<void> {
  const token  = process.env.LINKEDIN_ACCESS_TOKEN
  const author = process.env.LINKEDIN_AUTHOR_URN
  if (!token || !author) {
    console.log('  LinkedIn: skipped (missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_AUTHOR_URN)')
    return
  }
  const url = `${SITE_URL}/blog/${post.slug}`
  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: `${post.title}\n\n${post.excerpt}\n\n${hashtags(post)}\n\nRead more → ${url}` },
        shareMediaCategory: 'ARTICLE',
        media: [{ status: 'READY', originalUrl: url, title: { text: post.title }, description: { text: post.excerpt } }],
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}))
    throw new Error(`LinkedIn error: ${err.message || res.statusText}`)
  }
  const data: any = await res.json()
  console.log(`  LinkedIn: posted (id ${data.id})`)
}

// ── AgFuse (no public API) ────────────────────────────────────────────────────

function noteAgFuse(post: BlogPost): void {
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
  console.log(`\nPosting: "${post.title}" (${post.date})`)
  console.log(`URL: ${SITE_URL}/blog/${post.slug}\n`)

  await postToFacebookPage(post).catch((e) => console.error(`  Facebook Page error: ${e.message}`))
  await postToFacebookGroups(post).catch((e) => console.error(`  Facebook Groups error: ${e.message}`))
  await postToInstagram(post).catch((e) => console.error(`  Instagram error: ${e.message}`))
  await postToTwitter(post).catch((e) => console.error(`  Twitter error: ${e.message}`))
  await postToLinkedIn(post).catch((e) => console.error(`  LinkedIn error: ${e.message}`))
  noteAgFuse(post)
  console.log()
}

main().catch((err) => { console.error(err.message); process.exit(1) })
