import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { DecompositionPlan, FrontdoorRequest, OrchestrationRun } from '../../shared/frontdoorTypes'
import type { FrontdoorEventType, FrontdoorLedgerEvent } from '../../shared/frontdoorTypes'
import { ensureDir, readJson, removeFile, writeJsonAtomic, writeJsonExclusive } from '../jobLoop/ledger'
import { hashJson } from '../jobLoop/hash'
import { appendFrontdoorEvent, frontdoorRunProjection, readFrontdoorEvents, replayFrontdoorRun, validateFrontdoorEventChain } from './eventLedger'
import { assertRuntimeRootSafe } from './pathIntegrity'

export function runDirectory(runtimeRoot: string, runId: string): string {
  return path.join(runtimeRoot, 'frontdoor-runs', runId)
}

export async function writeRunBundle(runtimeRoot: string, request: FrontdoorRequest, plan: DecompositionPlan, run: OrchestrationRun): Promise<void> {
  await assertRuntimeRootSafe(runtimeRoot)
  const directory = runDirectory(runtimeRoot, run.runId)
  await ensureDir(directory)
  await writeJsonAtomic(path.join(directory, 'request.json'), request)
  await writeJsonAtomic(path.join(directory, 'plan.json'), plan)
  await writeJsonAtomic(path.join(directory, 'run.json'), run)
}

export async function writeRunBundleExclusive(runtimeRoot: string, request: FrontdoorRequest, plan: DecompositionPlan, run: OrchestrationRun): Promise<void> {
  await assertRuntimeRootSafe(runtimeRoot)
  const directory = runDirectory(runtimeRoot, run.runId)
  const parent = path.dirname(directory)
  await ensureDir(parent)
  const stagingDirectory = `${directory}.staging-${process.pid}-${Date.now()}`
  await mkdir(stagingDirectory)
  try {
    await writeJsonExclusive(path.join(stagingDirectory, 'request.json'), request)
    await writeJsonExclusive(path.join(stagingDirectory, 'plan.json'), plan)
    await writeJsonExclusive(path.join(stagingDirectory, 'run.json'), run)
    await writeJsonExclusive(path.join(stagingDirectory, 'bundle.manifest.json'), { requestHash: hashJson(request), planHash: hashJson(plan), runHash: hashJson(run) })
    await writeJsonExclusive(path.join(stagingDirectory, 'bundle.ready'), { bundleHash: hashJson({ request, plan, run }) })
    await rename(stagingDirectory, directory)
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true })
    throw error
  }
}

export async function writeRun(runtimeRoot: string, run: OrchestrationRun): Promise<void> {
  await assertRuntimeRootSafe(runtimeRoot)
  const directory = runDirectory(runtimeRoot, run.runId)
  const request = await readJson<FrontdoorRequest>(path.join(directory, 'request.json'))
  const plan = await readJson<DecompositionPlan>(path.join(directory, 'plan.json'))
  await writeJsonAtomic(path.join(directory, 'run.json'), run)
  await writeJsonAtomic(path.join(directory, 'bundle.manifest.json'), { requestHash: hashJson(request), planHash: hashJson(plan), runHash: hashJson(run) })
  await writeJsonAtomic(path.join(directory, 'bundle.ready'), { bundleHash: hashJson({ request, plan, run }) })
}

export async function writeAggregate(runtimeRoot: string, runId: string, aggregate: unknown): Promise<string> {
  await assertRuntimeRootSafe(runtimeRoot)
  const ref = `frontdoor-runs/${runId}/aggregate.json`
  await writeJsonAtomic(path.join(runtimeRoot, ref), aggregate)
  return ref
}

export async function readRun(runtimeRoot: string, runId: string): Promise<OrchestrationRun> {
  return readJson<OrchestrationRun>(path.join(runDirectory(runtimeRoot, runId), 'run.json'))
}

function projectionWithoutOwnerGate(run: OrchestrationRun): unknown {
  const projection = frontdoorRunProjection(run) as Record<string, unknown>
  const { ownerGate: _ownerGate, ...withoutOwnerGate } = projection
  return withoutOwnerGate
}

/**
 * Read the Ledger-derived Run projection and repair only the known rebuildable
 * Owner Gate cache drift. Any node/result/state divergence remains fail-closed.
 */
export async function readProjectedRun(runtimeRoot: string, runId: string, options: { repair?: boolean } = {}): Promise<OrchestrationRun> {
  const persisted = await readRun(runtimeRoot, runId)
  const events = await readRunEvents(runtimeRoot, runId)
  const projected = replayFrontdoorRun(events)
  if (hashJson(frontdoorRunProjection(persisted)) === hashJson(frontdoorRunProjection(projected))) return projected
  if (hashJson(projectionWithoutOwnerGate(persisted)) !== hashJson(projectionWithoutOwnerGate(projected))) {
    throw new Error('Frontdoor event replay/projection integrity diverges beyond Owner Gate; stale or tampered Run projection rejected')
  }
  if (options.repair !== false) await writeRun(runtimeRoot, projected)
  return projected
}

export async function readRequest(runtimeRoot: string, runId: string): Promise<FrontdoorRequest> {
  return readJson<FrontdoorRequest>(path.join(runDirectory(runtimeRoot, runId), 'request.json'))
}

export async function readPlan(runtimeRoot: string, runId: string): Promise<DecompositionPlan> {
  return readJson<DecompositionPlan>(path.join(runDirectory(runtimeRoot, runId), 'plan.json'))
}

export async function readRunEvents(runtimeRoot: string, runId: string): Promise<FrontdoorLedgerEvent[]> {
  const events = await readFrontdoorEvents(runtimeRoot, runId)
  validateFrontdoorEventChain(events, runId)
  return events
}

export async function assertBundleReady(runtimeRoot: string, runId: string): Promise<void> {
  const directory = runDirectory(runtimeRoot, runId)
  const ready = await readJson<{ bundleHash: string }>(path.join(directory, 'bundle.ready'))
  const request = await readJson<FrontdoorRequest>(path.join(directory, 'request.json'))
  const plan = await readJson<DecompositionPlan>(path.join(directory, 'plan.json'))
  const run = await readJson<OrchestrationRun>(path.join(directory, 'run.json'))
  const manifest = await readJson<{ requestHash: string; planHash: string; runHash: string }>(path.join(directory, 'bundle.manifest.json'))
  if (manifest.requestHash !== hashJson(request) || manifest.planHash !== hashJson(plan) || manifest.runHash !== hashJson(run)) throw new Error('Frontdoor bundle manifest does not match its files')
  if (ready.bundleHash !== hashJson({ request, plan, run })) throw new Error('Frontdoor bundle ready marker does not match its files')
}

export async function replayRunFromEvents(runtimeRoot: string, runId: string): Promise<OrchestrationRun> {
  return replayFrontdoorRun(await readRunEvents(runtimeRoot, runId))
}

export interface FrontdoorRunClaim {
  runId: string
  owner: string
  token: string
  pid: number
  hostname: string
  claimedAt: string
}

export async function readRunClaim(runtimeRoot: string, runId: string): Promise<FrontdoorRunClaim | null> {
  try {
    return await readJson<FrontdoorRunClaim>(path.join(runDirectory(runtimeRoot, runId), 'run.claim.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function claimRun(runtimeRoot: string, runId: string, owner: string): Promise<FrontdoorRunClaim> {
  await assertRuntimeRootSafe(runtimeRoot)
  const claim: FrontdoorRunClaim = { runId, owner, token: `claim-${hashJson([runId, owner, process.pid, Date.now()])}`, pid: process.pid, hostname: process.env.HOSTNAME ?? 'unknown', claimedAt: new Date().toISOString() }
  await writeJsonExclusive(path.join(runDirectory(runtimeRoot, runId), 'run.claim.json'), claim)
  return claim
}

export async function releaseRun(runtimeRoot: string, runId: string, token?: string): Promise<void> {
  const claim = await readRunClaim(runtimeRoot, runId)
  if (!claim || (token && claim.token !== token)) return
  await removeFile(path.join(runDirectory(runtimeRoot, runId), 'run.claim.json'))
}

export async function recordRunEvent(runtimeRoot: string, runId: string, type: FrontdoorEventType, details: Record<string, unknown>, occurredAt?: string): Promise<FrontdoorLedgerEvent> {
  await assertRuntimeRootSafe(runtimeRoot)
  return appendFrontdoorEvent(runtimeRoot, runId, type, details, occurredAt)
}
