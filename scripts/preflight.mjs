#!/usr/bin/env node
/**
 * Refuses to start `dev` or `build` when the environment would make them fail halfway.
 *
 * Written after `npm run build` wiped `release/mac-arm64/` and then died on `spawn pnpm ENOENT`.
 * electron-builder clears its output directory before it checks that the package manager it
 * detected is actually installed, so a missing tool does not fail early and safely — it fails after
 * the previous build is already gone. Everything below is a check that had to pass anyway; running
 * it first only changes *when* the failure happens, which is the entire point.
 *
 * Exit code 1 with a fix the reader can paste. Never repairs anything on its own.
 */
import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createConnection } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2]
if (mode !== 'dev' && mode !== 'build') {
  console.error('usage: node scripts/preflight.mjs <dev|build>')
  process.exit(2)
}

const problems = []
const notes = []

/** Resolves against PATH directly: no shell, so nothing here can be tricked by quoting. */
function has(command) {
  return (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        return statSync(path.join(dir, command)).isFile()
      } catch {
        return false
      }
    })
}

/** Which package manager electron-builder will try to spawn, by the same signal it uses: the lockfile. */
function detectPackageManager() {
  if (existsSync(path.join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(path.join(repoRoot, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    const done = (answer) => {
      socket.destroy()
      resolve(answer)
    }
    socket.setTimeout(400)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** Any Electron started from this repo: the packaged app, a dev run, or an MCP server. */
function runningElectron() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,command='], { encoding: 'utf8' })
    return out
      .split('\n')
      .filter((line) => line.includes(repoRoot) && /electron/i.test(line))
      .map((line) => {
        const [, pid, command] = /^\s*(\d+)\s+(.*)$/.exec(line) ?? []
        return { pid, command: command ?? '' }
      })
      .filter((entry) => entry.pid)
  } catch {
    return []
  }
}

// 1. The package manager electron-builder will spawn must exist.
const packageManager = detectPackageManager()
if (mode === 'build' && packageManager !== 'npm' && !has(packageManager)) {
  problems.push(
    `${packageManager} is not installed, but this repo has a ${packageManager} lockfile.\n` +
      `   electron-builder spawns it *after* clearing release/, so the existing app would be destroyed\n` +
      `   before the failure. Install it first:\n` +
      `     npm install -g ${packageManager}`
  )
}

// 2. dev and build both write out/. Running one while the other is live corrupts the running app.
const devServerLive = await portInUse(5173)
if (devServerLive && mode === 'build') {
  problems.push(
    'the renderer dev server is live on port 5173, so `npm run dev` is still running.\n' +
      '   Both commands write out/. Stop the dev process first (Ctrl-C in its terminal).'
  )
}
if (devServerLive && mode === 'dev') {
  problems.push('port 5173 is already taken — a dev server is probably already running. Use that window.')
}

// 3. A second instance shares one runtime root, so two processes would write one Ledger.
const electrons = runningElectron().filter((entry) => !entry.command.includes('bin.js mcp'))
if (electrons.length > 0) {
  problems.push(
    `an ADF window is already running (pid ${electrons.map((entry) => entry.pid).join(', ')}).\n` +
      '   Every instance shares one runtime root, so two of them write the same Ledger.\n' +
      '   Quit it before starting another.'
  )
}

// 4. Report MCP servers without blocking: they are headless and expected to be up.
const mcpServers = runningElectron().filter((entry) => entry.command.includes('bin.js mcp'))
if (mcpServers.length > 0) notes.push(`${mcpServers.length} MCP server process(es) running — expected, not a conflict.`)

// 5. Say what is about to be overwritten, so a destructive step is never a surprise.
if (mode === 'build') {
  const releaseDir = path.join(repoRoot, 'release', 'mac-arm64')
  if (existsSync(releaseDir)) notes.push(`release/mac-arm64/ will be cleared and rebuilt (a copy is kept by scripts/backup-release.mjs).`)
}

if (notes.length) {
  console.log(`preflight (${mode}):`)
  for (const note of notes) console.log(`  - ${note}`)
}

if (problems.length) {
  console.error(`\npreflight failed before anything was changed (${mode}):\n`)
  for (const problem of problems) console.error(` ✗ ${problem}\n`)
  console.error('Nothing has been built, cleared, or deleted.')
  process.exit(1)
}

console.log(`preflight (${mode}): ok`)
