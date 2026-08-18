import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { adfRepositoryRoot, blockDefenseRepositoryRoot } from '../../shared/projectRegistry'
import { obsidianRoot } from '../../shared/canonicalLinkPolicy'

const protectedRoots = [adfRepositoryRoot, blockDefenseRepositoryRoot, obsidianRoot]

function isSameOrInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function realpathWithMissingSuffix(value: string): Promise<string> {
  const missing: string[] = []
  let cursor = path.resolve(value)
  try {
    return await realpath(cursor)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  while (true) {
    missing.unshift(path.basename(cursor))
    const parent = path.dirname(cursor)
    if (parent === cursor) throw new Error('Runtime root cannot be resolved')
    cursor = parent
    try {
      const existing = await realpath(cursor)
      return path.join(existing, ...missing)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

export async function assertRuntimeRootSafe(runtimeRoot: string): Promise<string> {
  const resolved = await realpathWithMissingSuffix(runtimeRoot)
  for (const protectedRoot of protectedRoots) {
    const canonical = await realpath(protectedRoot)
    if (isSameOrInside(canonical, resolved) || isSameOrInside(resolved, canonical)) {
      throw new Error('Runtime root overlaps a protected Canonical repo or Obsidian root')
    }
  }
  return resolved
}

export async function assertNoSymlinkComponents(root: string, candidate: string): Promise<void> {
  const relative = path.relative(root, candidate)
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Runtime path is outside the fixed Runtime root')
  let cursor = root
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component)
    try {
      if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Runtime path contains a symlink')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break
      throw error
    }
  }
}

export async function safeRuntimePath(runtimeRoot: string, reference: string): Promise<string> {
  if (typeof reference !== 'string' || !reference || path.isAbsolute(reference) || reference.includes('\0')) throw new Error('Runtime reference is outside the fixed Runtime root')
  const normalized = path.normalize(reference)
  if (normalized !== reference || reference.split(/[\\/]/).includes('..')) throw new Error('Runtime reference contains a parent traversal')
  const root = await assertRuntimeRootSafe(runtimeRoot)
  const candidate = path.resolve(root, reference)
  await assertNoSymlinkComponents(root, candidate)
  const existing = await realpath(candidate)
  if (!isSameOrInside(root, existing)) throw new Error('Runtime reference is outside the fixed Runtime root')
  await assertNoSymlinkComponents(root, existing)
  return existing
}
