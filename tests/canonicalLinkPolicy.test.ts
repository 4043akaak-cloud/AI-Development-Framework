import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockDefenseRoot, canonicalSources, isCanonicalSourceId, isInsideRoot, isSafeRelativeMarkdownPath, obsidianRoot, repositoryRoot, rootFor } from '../src/shared/canonicalLinkPolicy'
import { registeredProjectFor, registeredProjects } from '../src/shared/projectRegistry'
import { openResolvedCanonicalSource, resolveCanonicalSource, type CanonicalSourceDefinition, type FileOperations } from '../src/main/canonicalSourceService'
import { safeDevelopmentRendererUrl } from '../src/shared/rendererUrlPolicy'

const testRoot = '/approved/root'
const allowedSources: Record<string, CanonicalSourceDefinition> = {
  safe: { rootPath: testRoot, relativePath: 'docs/safe.md' },
  text: { rootPath: testRoot, relativePath: 'docs/not-markdown.txt' },
  outside: { rootPath: testRoot, relativePath: 'docs/outside.md' }
}

function fakeFiles(resolvedPath = '/approved/root/docs/safe.md', exists = true, isFile = true): FileOperations {
  return {
    exists: () => exists,
    realpath: (candidate) => candidate === testRoot ? testRoot : resolvedPath,
    isFile: () => isFile
  }
}

describe('canonical source policy', () => {
  it('accepts only the static source registry', () => {
    expect(isCanonicalSourceId('task-mvp1')).toBe(true)
    expect(isCanonicalSourceId('block-defense-bd-003')).toBe(true)
    expect(isCanonicalSourceId('block-defense-bd-003-dispatch-prompt')).toBe(true)
    expect(isCanonicalSourceId('obsidian-block-defense-v2')).toBe(true)
    expect(isCanonicalSourceId('https://example.com')).toBe(false)
    expect(isCanonicalSourceId('../docs/tasks/ADF-MVP1-001.md')).toBe(false)
    expect(isCanonicalSourceId('')).toBe(false)
  })

  it('keeps project roots in an explicit registry instead of a project-specific code path', () => {
    expect(registeredProjects.map((project) => project.id)).toEqual(['adf', 'block-defense'])
    expect(registeredProjectFor('block-defense')?.repositoryRoot).toBe(blockDefenseRoot)
    expect(registeredProjectFor('unknown')).toBeUndefined()
  })

  it('allows normalized relative Markdown paths only', () => {
    expect(isSafeRelativeMarkdownPath('docs/tasks/ADF-MVP1-001.md')).toBe(true)
    expect(isSafeRelativeMarkdownPath('../secret.md')).toBe(false)
    expect(isSafeRelativeMarkdownPath('/tmp/file.md')).toBe(false)
    expect(isSafeRelativeMarkdownPath('file:///tmp/file.md')).toBe(false)
    expect(isSafeRelativeMarkdownPath('https://example.com/file.md')).toBe(false)
    expect(isSafeRelativeMarkdownPath('docs/../tasks/file.md')).toBe(false)
    expect(isSafeRelativeMarkdownPath('docs/task.txt')).toBe(false)
  })

  it('keeps resolved candidates inside their approved root', () => {
    expect(isInsideRoot(repositoryRoot, path.join(repositoryRoot, 'docs/tasks/ADF-MVP1-001.md'))).toBe(true)
    expect(isInsideRoot(repositoryRoot, path.resolve(repositoryRoot, '..', 'outside.md'))).toBe(false)
    expect(isInsideRoot(obsidianRoot, path.join(obsidianRoot, 'Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md'))).toBe(true)
    expect(isInsideRoot(blockDefenseRoot, path.join(blockDefenseRoot, 'docs/tasks/BD-002.md'))).toBe(true)
  })

  it('maps each snapshot source to a fixed root and Markdown path', () => {
    for (const sourceId of Object.keys(canonicalSources)) {
      const typedSourceId = sourceId as keyof typeof canonicalSources
      expect(rootFor(typedSourceId)).toMatch(/AI-Development-Framework|block-defense|secondbrain/)
      expect(isSafeRelativeMarkdownPath(canonicalSources[typedSourceId].relativePath)).toBe(true)
    }
  })

  it('does not open unknown, missing, non-Markdown, or root-escaping sources', async () => {
    const opened: string[] = []
    const open = async (candidate: string): Promise<string> => { opened.push(candidate); return '' }

    await expect(openResolvedCanonicalSource('unknown', allowedSources, open, fakeFiles())).resolves.toEqual({ ok: false, reason: 'unknown-source' })
    await expect(openResolvedCanonicalSource('safe', allowedSources, open, fakeFiles('/approved/root/docs/safe.md', false))).resolves.toEqual({ ok: false, reason: 'missing-file' })
    await expect(openResolvedCanonicalSource('text', allowedSources, open, fakeFiles())).resolves.toEqual({ ok: false, reason: 'invalid-source' })
    await expect(openResolvedCanonicalSource('outside', allowedSources, open, fakeFiles('/outside/escaped.md'))).resolves.toEqual({ ok: false, reason: 'outside-root' })
    expect(opened).toEqual([])
  })

  it('opens an allow-listed normal Markdown file exactly once', async () => {
    const opened: string[] = []
    const result = await openResolvedCanonicalSource('safe', allowedSources, async (candidate) => { opened.push(candidate); return '' }, fakeFiles())
    expect(result).toEqual({ ok: true })
    expect(opened).toEqual(['/approved/root/docs/safe.md'])
    expect(resolveCanonicalSource('safe', allowedSources, fakeFiles())).toEqual({ ok: true, path: '/approved/root/docs/safe.md' })
  })

  it('allows only local development renderer URLs and never when packaged', () => {
    expect(safeDevelopmentRendererUrl('http://127.0.0.1:5173', false)).toBe('http://127.0.0.1:5173/')
    expect(safeDevelopmentRendererUrl('http://localhost:5173', false)).toBe('http://localhost:5173/')
    expect(safeDevelopmentRendererUrl('https://example.com', false)).toBeUndefined()
    expect(safeDevelopmentRendererUrl('file:///tmp/renderer.html', false)).toBeUndefined()
    expect(safeDevelopmentRendererUrl('http://127.0.0.1:5173', true)).toBeUndefined()
  })
})
