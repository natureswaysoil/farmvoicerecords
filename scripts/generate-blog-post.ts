/**
 * Auto-generate a new FarmVoice Records blog post using OpenAI.
 * Creates a JSON file in content/blog/ and prints the filename.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-blog-post.ts
 *   TOPIC="GPS time tracking for farm crews" npx tsx scripts/generate-blog-post.ts
 */
import fs from 'fs'
import path from 'path'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

const TOPIC_POOL = [
  'How to prepare a complete farm pesticide application record',
  'GPS clock-in for farm crews: setup and best practices',
  'H-2A worker contract requirements: what must be in the job order',
  'Farm payroll to QuickBooks: reducing manual data entry',
  'USDA field boundary import: why accurate acreage matters for records',
  'Voice-first farm records: how spoken entries become compliance documents',
  'H-2A housing standards: common inspection failures and how to avoid them',
  'Pesticide record-keeping for small and hobby farms',
  'Crew scheduling for seasonal farm labor: a practical guide',
  'Farm inspection packages: what to prepare before an auditor arrives',
]

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

async function generatePost(topic: string, apiKey: string) {
  const today = new Date().toISOString().slice(0, 10)

  const prompt = `You are a technical writer for FarmVoice Records (farmvoicerecords.com), a farm recordkeeping and workforce app.

Write a practical, authoritative blog article on this topic: "${topic}"

Respond with ONLY valid JSON in this exact format (no markdown, no code block, just the JSON object):
{
  "title": "...",
  "excerpt": "One or two sentence summary for search engines and social sharing.",
  "tags": ["tag1", "tag2", "tag3"],
  "sections": [
    { "heading": "Section heading", "body": "Section body (1-3 paragraphs as a single string with sentences separated by spaces)." },
    ...
  ]
}

Requirements:
- 5 to 7 sections
- Each section body is 2-4 sentences of practical, factual content
- Include one section that explains how FarmVoice Records addresses the topic
- Focus on US farmers, H-2A employers, private pesticide applicators, and farm operators
- Accurate regulatory details where applicable
- Tags should be 2-4 short keywords relevant to the topic`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`)
  }

  const data: any = await res.json()
  const raw = data.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('Empty OpenAI response')

  const post = JSON.parse(raw)

  const slug = slugify(post.title || topic)
  const filename = `${today}-${slug}.json`
  const full = { slug, title: post.title, date: today, excerpt: post.excerpt, author: 'FarmVoice Records', tags: post.tags, sections: post.sections }

  fs.mkdirSync(BLOG_DIR, { recursive: true })
  fs.writeFileSync(path.join(BLOG_DIR, filename), JSON.stringify(full, null, 2))
  console.log(`Created: content/blog/${filename}`)
  console.log(`Title: ${post.title}`)
  return filename
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY or AI_GATEWAY_API_KEY required')

  const topic = process.env.TOPIC || TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)]
  console.log(`Topic: ${topic}`)

  await generatePost(topic, apiKey)
}

main().catch((err) => { console.error(err.message); process.exit(1) })
