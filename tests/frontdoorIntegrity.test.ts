import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { adfRepositoryRoot } from '../src/shared/projectRegistry'
import { assertRuntimeRootSafe, safeRuntimePath } from '../src/main/frontdoor/pathIntegrity'
import { recordRunEvent } from '../src/main/frontdoor/ledger'
import { readVerifiedWorkPlaneArtifact } from '../src/main/frontdoor/workPlaneArtifact'
import { hashJson } from '../src/main/jobLoop/hash'

describe('Frontdoor Work Plane integrity boundaries', () => {
  it('rejects the Canonical repository and a symlink to it as runtime roots', async () => {
    await expect(assertRuntimeRootSafe(adfRepositoryRoot)).rejects.toThrow(/protected Canonical repo/)
    const parent = await mkdtemp(path.join(os.tmpdir(), 'adf-integrity-root-'))
    const link = path.join(parent, 'runtime-link')
    await symlink(adfRepositoryRoot, link, 'dir')
    await expect(assertRuntimeRootSafe(link)).rejects.toThrow(/protected Canonical repo/)
  })

  it('rejects symlink components inside an otherwise isolated runtime root', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-integrity-symlink-'))
    const target = path.join(runtimeRoot, 'target.json')
    await writeFile(target, '{"safe":true}\n', 'utf8')
    await symlink(target, path.join(runtimeRoot, 'link.json'))
    await expect(safeRuntimePath(runtimeRoot, 'link.json')).rejects.toThrow(/symlink/)
  })

  it('rejects parent traversal and absolute references', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-integrity-path-'))
    await mkdir(path.join(runtimeRoot, 'nested'))
    await expect(safeRuntimePath(runtimeRoot, '../outside.json')).rejects.toThrow(/parent traversal|outside/)
    await expect(safeRuntimePath(runtimeRoot, path.join(runtimeRoot, 'nested'))).rejects.toThrow(/outside/)
  })

  it('blocks direct Ledger writes against a protected root', async () => {
    await expect(recordRunEvent(adfRepositoryRoot, 'run-protected', 'frontdoor.run-created', { snapshot: {} })).rejects.toThrow(/protected Canonical repo/)
  })

  it('binds a read artifact to the requested Run before reading its content', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-integrity-artifact-'))
    const content = { runId: 'run-other', value: 'candidate' }
    const manifest = { artifactId: 'artifact-001', runId: 'run-other', relativePath: 'frontdoor-runs/run-other/work-plane/artifact-001.json', contentHash: hashJson(content) } as never
    await expect(readVerifiedWorkPlaneArtifact(runtimeRoot, 'run-requested', manifest)).rejects.toThrow(/another Run/)
  })
})
