import type { FrontdoorLedgerEvent, WorkPlaneArtifactManifest } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { safeRuntimePath } from './pathIntegrity'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function latestWorkPlaneArtifactManifest(events: readonly FrontdoorLedgerEvent[]): WorkPlaneArtifactManifest | undefined {
  const event = [...events].reverse().find((candidate) => candidate.type === 'frontdoor.owner-decision-recorded' && isRecord(candidate.payload.artifact))
  return event && isRecord(event.payload.artifact) ? event.payload.artifact as unknown as WorkPlaneArtifactManifest : undefined
}

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
