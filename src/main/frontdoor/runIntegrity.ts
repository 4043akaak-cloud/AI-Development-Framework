import type { DecompositionPlan, FrontdoorLedgerEvent, FrontdoorRequest, OrchestrationRun } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { validateDecompositionPlan } from './decomposition'
import { assertBundleReady } from './ledger'
import { frontdoorRunProjection, replayFrontdoorRun } from './eventLedger'
import { assertRuntimeRootSafe } from './pathIntegrity'

function childTaskId(requestId: string, nodeId: string): string {
  return `${requestId}::${nodeId}`
}

function requestHash(request: FrontdoorRequest): string {
  const { state: _state, inputHash: _inputHash, ...body } = request
  return hashJson(body)
}

function planHash(plan: DecompositionPlan): string {
  const { planHash: _planHash, ...body } = plan
  return hashJson(body)
}

export async function assertRunIntegrity(runtimeRoot: string, run: OrchestrationRun, request: FrontdoorRequest, plan: DecompositionPlan, verifyBundle = true): Promise<void> {
  await assertRuntimeRootSafe(runtimeRoot)
  if (verifyBundle) await assertBundleReady(runtimeRoot, run.runId)
  if (requestHash(request) !== run.requestHash || request.inputHash !== run.requestHash) throw new Error('Frontdoor request hash integrity check failed')
  if (planHash(plan) !== run.planHash || plan.planHash !== run.planHash) throw new Error('Frontdoor plan hash integrity check failed')
  const expectedRunId = `run-${hashJson([request.requestId, request.inputHash, plan.planHash]).slice(0, 20)}`
  if (run.runId !== expectedRunId) throw new Error('Frontdoor run binding hash integrity check failed')
  if (run.requestId !== request.requestId) throw new Error('Frontdoor run request binding mismatch')
  if (run.runKind !== request.runKind || hashJson(run.implementationBinding ?? null) !== hashJson(request.implementationBinding ?? null)) throw new Error('Frontdoor implementation binding mismatch')
  if (!Array.isArray(run.nodes) || run.nodes.some((record) => record.childTaskId !== childTaskId(request.requestId, record.node.nodeId) || !Number.isInteger(record.attempt) || record.attempt < 0)) throw new Error('Frontdoor node record binding is invalid')
  const isNodeReviewContinuation = run.state === 'ready-for-approval' && run.ownerGate === 'awaiting-owner:dispatch' && run.nodes.some((record) => record.state === 'completed' || record.state === 'failed' || record.state === 'awaiting-question')
  if (run.state === 'ready-for-approval' && (!isNodeReviewContinuation && run.nodes.some((record) => record.state !== 'queued' || record.resultRef || record.threadId || record.childJobId) || run.approvalIds.length > 0 || run.aggregateResultRef || run.nodeReview)) throw new Error('Frontdoor ready state is inconsistent with node records')
  if (['complete', 'partial', 'failed', 'cancelled'].includes(run.state) && run.nodes.some((record) => record.state === 'queued' || record.state === 'running')) throw new Error('Frontdoor terminal state has unfinished nodes')
  validateDecompositionPlan(request, plan)
  if (run.nodes.length !== plan.nodes.length || run.nodes.some((record) => {
    const expected = plan.nodes.find((node) => node.nodeId === record.node.nodeId)
    return !expected || hashJson(record.node) !== hashJson(expected)
  })) throw new Error('Frontdoor run node plan does not match the persisted plan')
}

export function assertRunEventConsistency(run: OrchestrationRun, events: readonly FrontdoorLedgerEvent[]): void {
  if (events.length === 0) throw new Error('Frontdoor run has no ledger events')
  const replayed = replayFrontdoorRun(events)
  if (hashJson(frontdoorRunProjection(replayed)) !== hashJson(frontdoorRunProjection(run))) throw new Error('Frontdoor event replay does not match run.json')
  const lastResume = Math.max(-1, ...events.filter((event) => event.type === 'frontdoor.question-answered' || event.type === 'frontdoor.node-review-continued').map((event) => event.sequence))
  const progressed = events.some((event) => event.sequence > lastResume && ['frontdoor.approval-bound', 'frontdoor.node-started', 'frontdoor.node-completed', 'frontdoor.node-failed', 'frontdoor.run-completed', 'frontdoor.run-stopped'].includes(event.type))
  if (run.state === 'ready-for-approval' && progressed) throw new Error('Frontdoor ready state conflicts with persisted execution events')
  if (['complete', 'partial', 'failed', 'blocked-by-question', 'cancelled'].includes(run.state) && !events.some((event) => event.type === 'frontdoor.run-completed' || event.type === 'frontdoor.run-stopped')) throw new Error('Frontdoor terminal state has no terminal ledger event')
}
