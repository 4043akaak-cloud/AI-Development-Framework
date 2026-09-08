// Layer 1 — asset layer.
//
// Input:  a question spec (JSON) naming exactly which notes and excerpts to use.
// Output: context-pack.md, a single file, safe to hand to an AI.
//
// The vault is the source of truth; this file is a derivative. We never read the
// whole vault: only the notes the spec names. That rule comes from
// docs/obsidian/OBSIDIAN_INTEGRATION.md ("Vault全体を渡さず、指定ノートだけを渡す").

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { assertInside, DEFAULT_VAULT, isMain, parseArgs, writeFileEnsured } from './common.mjs'

const SOURCES_HEADING = '## 収録元'

// A context pack must be bounded. ADF already bounds what it sends to an adapter
// (docs/project/CURRENT_STATE.md, 2026-08-25: 1 Turn max 1200 chars, dependent
// Result max 1000 chars); the asset layer follows the same discipline. An
// unbounded pack also overruns a local model's context window: llama3:latest
// carries 8192 tokens, and Japanese costs roughly one token per character.
export const DEFAULT_MAX_CHARS_PER_SOURCE = 1200
export const DEFAULT_MAX_CHARS_TOTAL = 6000

function truncate(text, limit) {
  const trimmed = text.trim()
  if (trimmed.length <= limit) {
    return { text: trimmed, kept: trimmed.length, dropped: 0, original: trimmed.length }
  }
  return {
    // `kept` counts source characters only. The truncation notice is bookkeeping,
    // not content, so charging it to the budget made the pack overrun its own
    // declared limit.
    text: `${trimmed.slice(0, limit)}\n\n…（切り詰め: 全${trimmed.length}文字のうち先頭${limit}文字）`,
    kept: limit,
    dropped: trimmed.length - limit,
    original: trimmed.length
  }
}

function sliceLines(text, range) {
  if (!range) return text
  const match = /^(\d+)-(\d+)$/.exec(range)
  if (!match) throw new Error(`bad line range: ${range}`)
  const from = Number(match[1])
  const to = Number(match[2])
  return text.split('\n').slice(from - 1, to).join('\n')
}

export async function buildContextPack(spec, { vaultRoot = DEFAULT_VAULT, ...limits } = {}) {
  const maxPerSource = limits.maxCharsPerSource ?? spec.maxCharsPerSource ?? DEFAULT_MAX_CHARS_PER_SOURCE
  const maxTotal = limits.maxCharsTotal ?? spec.maxCharsTotal ?? DEFAULT_MAX_CHARS_TOTAL

  const notes = spec.notes ?? []
  const excerpts = spec.excerpts ?? []
  if (notes.length === 0 && excerpts.length === 0) {
    throw new Error('the spec names no notes and no excerpts; refusing to build an empty pack')
  }

  const sections = []
  const sources = []
  const truncations = []
  let used = 0
  let omitted = 0

  const add = ({ label, sourceLine, body, wrap }) => {
    if (used >= maxTotal) {
      omitted += 1
      sources.push(`${sourceLine} — ⚠総量上限のため未収録`)
      return
    }
    const perSource = Math.min(maxPerSource, maxTotal - used)
    const { text, kept, dropped, original } = truncate(body, perSource)
    used += kept
    if (dropped > 0) truncations.push(`${label}: ${original}文字中${kept}文字を収録`)
    sources.push(dropped > 0 ? `${sourceLine} — ⚠切り詰めあり` : sourceLine)
    sections.push(`## ${label}\n\n${wrap ? `\`\`\`\n${text}\n\`\`\`` : text}`)
  }

  // Excerpts go first. An excerpt is a deliberately line-ranged passage — it is
  // usually the very thing being judged — while vault notes are surrounding
  // background. Filling the budget with background first starved the excerpt of
  // the sentence under review, and both models then answered without ever
  // seeing the claim they were asked about.
  const collectExcerpts = async () => {
    for (const excerpt of excerpts) {
      const body = sliceLines(await readFile(excerpt.path, 'utf8'), excerpt.lines)
      const where = excerpt.lines ? `${excerpt.path}:${excerpt.lines}` : excerpt.path
      add({
        label: `excerpt :: ${excerpt.label}`,
        sourceLine: `- excerpt :: ${excerpt.label} — \`${where}\``,
        body,
        wrap: true
      })
    }
  }

  const collectNotes = async () => {
    for (const rel of notes) {
      // A note reference must stay inside the vault; `notes` is spec-supplied.
      const body = await readFile(assertInside(vaultRoot, path.join(vaultRoot, rel), 'note'), 'utf8')
      const basename = path.basename(rel, '.md')
      add({
        label: `vault :: ${basename}`,
        sourceLine: `- vault :: [[${basename}]] — \`${rel}\``,
        body,
        wrap: false
      })
    }
  }

  if (spec.order === 'notes-first') {
    await collectNotes()
    await collectExcerpts()
  } else {
    await collectExcerpts()
    await collectNotes()
  }

  const header = [
    `# Context Pack — ${spec.id}`,
    '',
    `- generated: ${new Date().toISOString()}`,
    `- vault root: \`${vaultRoot}\``,
    `- note count: ${notes.length}`,
    `- excerpt count: ${excerpts.length}`,
    `- budget: ${used} / ${maxTotal} chars (per source ${maxPerSource})`,
    '',
    'この1ファイルがAIへ渡す資産のすべてである。Vault全体は渡していない。',
    '',
    SOURCES_HEADING,
    '',
    ...sources
  ]

  if (truncations.length > 0 || omitted > 0) {
    header.push('', '### 切り詰め', '')
    for (const note of truncations) header.push(`- ${note}`)
    if (omitted > 0) header.push(`- 総量上限により ${omitted} 件を未収録`)
  }

  return `${header.join('\n')}\n\n---\n\n${sections.join('\n\n---\n\n')}\n`
}

/**
 * Read the sources back out of a generated pack, so later layers need only the
 * file. Excerpts are returned too: a decision that leaned on a repo excerpt is
 * not traceable if the note it produces cites only the vault side.
 */
export function readSourcesFromPack(packText) {
  const notes = []
  const excerpts = []
  let inSources = false
  for (const raw of packText.split('\n')) {
    const line = raw.trim()
    if (line === SOURCES_HEADING) {
      inSources = true
      continue
    }
    if (inSources && raw.startsWith('## ')) break
    if (!inSources) continue

    const note = /^- vault :: \[\[(.+?)\]\]/.exec(line)
    if (note) {
      notes.push(note[1])
      continue
    }
    const excerpt = /^- excerpt :: (.+?) — `(.+?)`/.exec(line)
    if (excerpt) excerpts.push({ label: excerpt[1], where: excerpt[2] })
  }
  return { notes, excerpts }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const spec = JSON.parse(await readFile(args.spec, 'utf8'))
  const pack = await buildContextPack(spec, { vaultRoot: args.vault ?? DEFAULT_VAULT })
  const written = await writeFileEnsured(args.out, pack)
  process.stderr.write(`wrote ${written}\n`)
}
