import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { DecompositionPlanInput, FrontdoorPrepareResult, FrontdoorRequestInput } from '../../shared/frontdoorTypes'
import type { AcceptedCandidateSourceBinding } from '../../shared/implementationTypes'
import { hashJson } from '../jobLoop/hash'
import { readRunEvents, recordRunEvent } from './ledger'
import { prepareFrontdoorRunOrThrow } from './frontdoorPrepareService'
import type { FrontdoorOrchestrator } from './orchestrator'

export interface PrepareNextRequestFromCandidateInput {
  candidateId: string
  request: Omit<FrontdoorRequestInput, 'sourceCandidateBinding'>
  plan: DecompositionPlanInput
}

function textField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('..')) throw new Error(`Candidate artifact ${label} is invalid`)
  return value
}

function latestAcceptedDecision(orchestrator: FrontdoorOrchestrator, childRunId: string, candidateId: string, targetHash: string): Promise<{ decisionId: string; targetHash: string; expiresAt?: string }> {
  return readRunEvents(orchestrator.runtimeRoot, childRunId).then((events) => {
    for (const event of [...events].reverse()) {
      if (event.type !== 'frontdoor.candidate-reviewed' || event.payload.candidateId !== candidateId) continue
      const decision = event.payload.decision as { decision?: unknown; decisionId?: unknown; targetHash?: unknown; expiresAt?: unknown } | undefined
      if (decision?.decision !== 'accept' || typeof decision.decisionId !== 'string' || decision.targetHash !== targetHash) continue
      const recorded = events.some((candidate) => {
        if (candidate.type !== 'frontdoor.owner-decision-recorded') return false
        const stored = candidate.payload.decision as { decisionId?: unknown; runId?: unknown; gate?: unknown; decision?: unknown; targetHash?: unknown; approvedBy?: unknown; decidedAt?: unknown; expiresAt?: unknown } | undefined
        if (!stored) return false
        return stored?.decisionId === decision.decisionId
          && stored.runId === childRunId
          && stored.gate === 'candidate-review'
          && stored.decision === 'accept'
          && stored.targetHash === targetHash
          && stored.approvedBy === (decision as { approvedBy?: unknown }).approvedBy
          && stored.decidedAt === (decision as { decidedAt?: unknown }).decidedAt
          && stored.expiresAt === (decision as { expiresAt?: unknown }).expiresAt
      })
      if (!recorded) throw new Error('Accepted Candidate Decision is not bound to its Owner Decision Ledger entry')
      if (decision.expiresAt !== undefined && typeof decision.expiresAt !== 'string') throw new Error('Accepted Candidate Decision expiry is invalid')
      if (decision.expiresAt && Date.parse(decision.expiresAt) <= orchestrator.clock().getTime()) throw new Error('Accepted Candidate Decision is expired')
      return { decisionId: decision.decisionId, targetHash: decision.targetHash, ...(decision.expiresAt ? { expiresAt: decision.expiresAt } : {}) }
    }
    throw new Error('Candidate requires the latest accepted Candidate Review Decision')
  })
}

async function assertCandidateNotAlreadyBound(orchestrator: FrontdoorOrchestrator, candidateId: string, requestId: string): Promise<void> {
  const runsRoot = path.join(orchestrator.runtimeRoot, 'frontdoor-runs')
  let entries
  try {
    entries = await readdir(runsRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const events = await readRunEvents(orchestrator.runtimeRoot, entry.name).catch(() => [])
    const existing = events.find((event) => event.type === 'frontdoor.candidate-request-created' && event.payload.candidateId === candidateId)
    if (!existing) continue
    if (existing.payload.requestId !== requestId) throw new Error(`Candidate is already bound to another Request: ${candidateId}`)
  }
}

function bindingBody(inspection: Awaited<ReturnType<FrontdoorOrchestrator['inspectCandidate']>>, decision: { decisionId: string; targetHash: string }): Omit<AcceptedCandidateSourceBinding, 'bindingHash'> {
  const manifest = inspection.manifest
  return {
    candidateId: inspection.summary.candidateId,
    candidateHash: inspection.candidate.candidateHash,
    artifactRef: textField(manifest.relativePath, 'relativePath'),
    reviewDecisionId: decision.decisionId,
    reviewTargetHash: decision.targetHash,
    childRunId: inspection.summary.childRunId,
    parentRunId: inspection.binding.parentRunId,
    sourceAggregateRef: inspection.binding.sourceAggregateRef,
    sourceAggregateHash: inspection.binding.sourceAggregateHash,
    sourceResultRef: inspection.binding.sourceResultRef,
    sourceResultHash: inspection.binding.sourceResultHash,
    sourceEvidenceRef: inspection.binding.sourceEvidenceRef,
    sourceEvidenceHash: inspection.binding.sourceEvidenceHash
  }
}

export async function prepareNextRequestFromAcceptedCandidate(orchestrator: FrontdoorOrchestrator, input: PrepareNextRequestFromCandidateInput): Promise<FrontdoorPrepareResult & { sourceCandidateBinding: AcceptedCandidateSourceBinding }> {
  const inspection = await orchestrator.inspectCandidate(input.candidateId)
  if (inspection.state !== 'accepted') throw new Error(`Candidate must be accepted before creating a Request: ${inspection.state}`)
  const decision = await latestAcceptedDecision(orchestrator, inspection.summary.childRunId, input.candidateId, inspection.targetHash)
  await assertCandidateNotAlreadyBound(orchestrator, input.candidateId, input.request.requestId)
  const body = bindingBody(inspection, decision)
  const sourceCandidateBinding = { ...body, bindingHash: hashJson(body) }
  const request = { ...input.request, sourceCandidateBinding }
  const prepared = await prepareFrontdoorRunOrThrow(orchestrator, { request, plan: input.plan }, { trustedSourceCandidateBinding: sourceCandidateBinding })
  const events = await readRunEvents(orchestrator.runtimeRoot, prepared.run.runId)
  const existing = events.find((event) => event.type === 'frontdoor.candidate-request-created')
  const eventPayload = {
    candidateId: sourceCandidateBinding.candidateId,
    candidateHash: sourceCandidateBinding.candidateHash,
    artifactRef: sourceCandidateBinding.artifactRef,
    reviewDecisionId: sourceCandidateBinding.reviewDecisionId,
    reviewTargetHash: sourceCandidateBinding.reviewTargetHash,
    sourceRunId: sourceCandidateBinding.childRunId,
    parentRunId: sourceCandidateBinding.parentRunId,
    requestId: prepared.run.requestId,
    requestHash: prepared.run.requestHash,
    sourceCandidateBindingHash: sourceCandidateBinding.bindingHash
  }
  if (existing) {
    if (hashJson(existing.payload) !== hashJson(eventPayload)) throw new Error('Candidate Request creation Event binding mismatch')
  } else {
    await recordRunEvent(orchestrator.runtimeRoot, prepared.run.runId, 'frontdoor.candidate-request-created', eventPayload)
  }
  return { ...prepared, sourceCandidateBinding }
}
