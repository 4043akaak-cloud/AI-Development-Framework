import type { WorkPlaneArtifactManifest } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { safeRuntimePath } from './pathIntegrity'

export async function readVerifiedWorkPlaneArtifact(runtimeRoot: string, requestedRunId: string, manifest: WorkPlaneArtifactManifest): Promise<{ manifest: WorkPlaneArtifactManifest; content: unknown }> {
  if (manifest.runId !== requestedRunId) throw new Error('Work Plane artifact belongs to another Run')
  const expectedPath = `frontdoor-runs/${manifest.runId}/work-plane/${manifest.artifactId}.json`
  if (manifest.relativePath !== expectedPath) throw new Error('Work Plane artifact path is not bound to its Run and artifactId')
  const artifactFile = await safeRuntimePath(runtimeRoot, manifest.relativePath)
  const stored = await readJson<{ manifest?: unknown; content?: unknown }>(artifactFile)
  if (!stored.manifest || hashJson(stored.manifest) !== hashJson(manifest)) throw new Error('Work Plane artifact manifest mismatch')
  if (hashJson(stored.content) !== manifest.contentHash) throw new Error('Work Plane artifact content hash mismatch')
  return { manifest, content: stored.content }
}
