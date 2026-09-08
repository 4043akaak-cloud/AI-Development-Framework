// Verification for acceptance criterion 4: every wikilink in a generated note
// must resolve to a note that actually exists in the vault.
//
// Obsidian resolves [[Name]] by basename anywhere in the vault, and tolerates a
// trailing .md, so we index both forms.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { DEFAULT_VAULT, isMain, parseArgs, writeJson } from './common.mjs'

async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await walk(full)))
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full)
  }
  return found
}

export async function indexVault(vaultRoot) {
  const files = await walk(vaultRoot)
  const index = new Set()
  for (const file of files) {
    const rel = path.relative(vaultRoot, file)
    index.add(path.basename(file, '.md'))
    index.add(rel)
    index.add(rel.replace(/\.md$/, ''))
  }
  return index
}

export function extractWikilinks(text) {
  const links = []
  for (const match of text.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    links.push(match[1].trim())
  }
  return links
}

export async function checkLinks({ notePaths, vaultRoot = DEFAULT_VAULT }) {
  const index = await indexVault(vaultRoot)
  const results = []
  for (const notePath of notePaths) {
    const text = await readFile(notePath, 'utf8')
    for (const link of extractWikilinks(text)) {
      const resolved = index.has(link) || index.has(link.replace(/\.md$/, ''))
      results.push({ note: notePath, link, resolved })
    }
  }
  const broken = results.filter((entry) => !entry.resolved)
  return { vaultRoot, checked: results.length, broken, results, pass: broken.length === 0 }
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  const { runPaths, DEFAULT_OUT_ROOT } = await import('./common.mjs')
  const paths = runPaths(args['out-root'] ?? DEFAULT_OUT_ROOT, args.run)
  const notes = (await readdir(paths.obsidianOut)).map((name) => path.join(paths.obsidianOut, name))
  const report = await checkLinks({ notePaths: notes, vaultRoot: args.vault ?? DEFAULT_VAULT })
  await writeJson(paths.linkReport, report)
  process.stderr.write(`linkcheck: ${report.pass ? 'PASS' : 'FAIL'} (${report.checked} links, ${report.broken.length} broken)\n`)
  if (!report.pass) process.exitCode = 1
}
