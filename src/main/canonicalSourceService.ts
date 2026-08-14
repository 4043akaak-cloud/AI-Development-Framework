import { existsSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { isInsideRoot, isSafeRelativeMarkdownPath } from '../shared/canonicalLinkPolicy'
import type { OpenSourceResult } from '../shared/boardTypes'

export interface CanonicalSourceDefinition {
  rootPath: string
  relativePath: string
}

export interface FileOperations {
  exists: (candidate: string) => boolean
  realpath: (candidate: string) => string
  isFile: (candidate: string) => boolean
}

export const localFileOperations: FileOperations = {
  exists: existsSync,
  realpath: realpathSync,
  isFile: (candidate) => lstatSync(candidate).isFile()
}

export function resolveCanonicalSource(value: unknown, sources: Record<string, CanonicalSourceDefinition>, fileOperations: FileOperations = localFileOperations): { ok: true; path: string } | { ok: false; reason: NonNullable<OpenSourceResult['reason']> } {
  if (typeof value !== 'string' || !Object.hasOwn(sources, value)) return { ok: false, reason: 'unknown-source' }

  const source = sources[value]
  if (!isSafeRelativeMarkdownPath(source.relativePath)) return { ok: false, reason: 'invalid-source' }

  const candidate = path.resolve(source.rootPath, source.relativePath)
  if (!isInsideRoot(source.rootPath, candidate) || !fileOperations.exists(candidate)) return { ok: false, reason: 'missing-file' }

  const resolvedRoot = fileOperations.realpath(source.rootPath)
  const resolvedCandidate = fileOperations.realpath(candidate)
  if (!isInsideRoot(resolvedRoot, resolvedCandidate)) return { ok: false, reason: 'outside-root' }
  if (!resolvedCandidate.endsWith('.md')) return { ok: false, reason: 'unsupported-file' }
  if (!fileOperations.isFile(resolvedCandidate)) return { ok: false, reason: 'not-a-file' }

  return { ok: true, path: resolvedCandidate }
}

export async function openResolvedCanonicalSource(value: unknown, sources: Record<string, CanonicalSourceDefinition>, openPath: (candidate: string) => Promise<string>, fileOperations: FileOperations = localFileOperations): Promise<OpenSourceResult> {
  const resolved = resolveCanonicalSource(value, sources, fileOperations)
  if (!resolved.ok) return resolved

  const error = await openPath(resolved.path)
  return error ? { ok: false, reason: 'open-failed' } : { ok: true }
}
