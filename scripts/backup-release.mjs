#!/usr/bin/env node
/**
 * Copies the current packaged app aside before electron-builder clears its output directory.
 *
 * The build that prompted this deleted a working app and then failed, and there was no copy of it
 * anywhere: `release/` is gitignored, so Git held nothing either. Preflight now catches the known
 * cause of that failure, but a build can still fail for a reason nobody predicted. This exists for
 * the unpredicted one — it costs a directory copy and buys back the ability to say "the previous
 * build is still there".
 *
 * Keeps the newest few and drops the rest, so it cannot quietly fill the disk.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(repoRoot, 'release', 'mac-arm64')
const backupRoot = path.join(repoRoot, 'release', '.backups')
const keep = 3

const apps = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((entry) => entry.endsWith('.app') && entry !== 'Electron.app')
  : []

if (apps.length === 0) {
  console.log('backup-release: no packaged app to copy — nothing at risk.')
  process.exit(0)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const destination = path.join(backupRoot, stamp)
mkdirSync(destination, { recursive: true })

for (const app of apps) {
  cpSync(path.join(releaseDir, app), path.join(destination, app), { recursive: true, verbatimSymlinks: true })
  console.log(`backup-release: kept ${app} -> release/.backups/${stamp}/${app}`)
}

// Prune oldest first. Never touches anything outside release/.backups.
const snapshots = readdirSync(backupRoot)
  .map((entry) => ({ entry, full: path.join(backupRoot, entry) }))
  .filter((item) => statSync(item.full).isDirectory())
  .sort((left, right) => left.entry.localeCompare(right.entry))

for (const stale of snapshots.slice(0, Math.max(0, snapshots.length - keep))) {
  rmSync(stale.full, { recursive: true, force: true })
  console.log(`backup-release: pruned release/.backups/${stale.entry}`)
}
