// Shared utilities for the three-layer walking skeleton.
// This module holds helpers only. It must not hold state that crosses a layer
// boundary: every layer reads its input from disk and writes its output to disk.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_VAULT = path.join(
  os.homedir(),
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/second Brain/obsidian'
)

export const DEFAULT_OUT_ROOT = path.join(os.homedir(), '.adf-arena')

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Refuse a path that escapes its root. The question spec is described as a
 * swappable payload, so a spec id like "../../…/second Brain/obsidian/x" would
 * otherwise let a payload write straight into the vault — breaking the one
 * guarantee this tool makes about the vault.
 */
export function assertInside(root, target, what) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    const error = new Error(`${what} escapes ${resolvedRoot}: ${resolved}`)
    error.fatal = true
    throw error
  }
  return resolved
}

export function runPaths(outRoot, runId) {
  const dir = path.join(outRoot, runId)
  assertInside(outRoot, dir, 'run directory')
  return {
    dir,
    contextPack: path.join(dir, 'context-pack.md'),
    prompt: path.join(dir, 'prompt.txt'),
    answer: (side) => path.join(dir, `answer-${side}.json`),
    // Manual relay: the request tells the Owner what to paste where, and the raw
    // file is where they drop what the external AI gave back.
    request: (side) => path.join(dir, `answer-${side}.request.md`),
    raw: (side) => path.join(dir, `answer-${side}.raw.txt`),
    verdict: path.join(dir, 'verdict.md'),
    decisionLog: path.join(dir, 'decision-log.json'),
    obsidianOut: path.join(dir, 'obsidian-out'),
    linkReport: path.join(dir, 'link-report.json')
  }
}

export async function writeFileEnsured(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
  return filePath
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function writeJson(filePath, value) {
  return writeFileEnsured(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

/** Fail closed on anything that is not a loopback address. */
export function assertLoopback(endpoint) {
  const url = new URL(endpoint)
  const host = url.hostname
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1' && host !== '[::1]') {
    // Marked fatal so it stops the run outright. A safety-boundary violation
    // must not be swallowed by the "one side may die" tolerance and reported as
    // just another adapter failure.
    const error = new Error(`refusing a non-loopback endpoint: ${endpoint}`)
    error.fatal = true
    throw error
  }
  return url
}

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      out[key] = next
      i += 1
    }
  }
  return out
}

export function isMain(importMetaUrl) {
  return process.argv[1] && importMetaUrl === `file://${path.resolve(process.argv[1])}`
}
