import { link, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ApprovedTaskPacket, JobRequest } from '../../shared/jobLoopTypes'
import type { AggregateResult, FrontdoorQuestion, OwnerDecision, OwnerDecisionEnvelope, OwnerGate, OrchestrationNodeRecord, OrchestrationRun, WorkPlaneArtifactManifest } from '../../shared/frontdoorTypes'
import type { ImplementationSourceBinding, CandidateSummary, CandidateInspectionResult, CandidateReviewStartedResult, CandidateReviewDecisionInput, CandidateReviewOwnerDecisionEnvelope, CandidateReviewState } from '../../shared/implementationTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { claimRun, readPlan, readProjectedRun, readRequest, readRun, readRunEvents, recordRunEvent, releaseRun, writeRun } from './ledger'
import { getAdapterProfile } from '../jobLoop/adapterRegistry'
import { assertRunEventConsistency, assertRunIntegrity } from './runIntegrity'
import { validateImplementationCandidate } from './candidateArtifact'
import { assertImplementationSourceArtifacts } from './implementationBinding'
import { assertNoSymlinkComponents, safeRuntimePath } from './pathIntegrity'
import { readVerifiedWorkPlaneArtifact } from './workPlaneArtifact'

const decisionByGate: Record<OwnerGate, readonly OwnerDecision[]> = {
  intake: ['clarify', 'edit', 'reject', 'proceed', 'stop'],
  'completion-shape': ['edit', 'approve', 'reject', 'stop'],
  decomposition: ['edit', 'approve-selected', 'reject', 'stop'],
  dispatch: ['dispatch', 'approve-selected', 'defer', 'stop'],
  'node-review': ['continue', 'stop'],
  question: ['answer', 'revise-plan', 'stop'],
  'result-review': ['accept', 'follow-up', 'reject', 'stop'],
  completion: ['approve', 'continue', 'stop', 'complete'],
  'artifact-export': ['export', 'stop'],
  'candidate-review': ['accept', 'reject', 'follow-up', 'stop']
}


export interface DecisionCheckInput {
  gate: OwnerGate
  decision: OwnerDecision
  targetHash: string
  expectedTargetHash: string
  approvedBy: string
}

export function canApprove(input: DecisionCheckInput): boolean {
  return input.approvedBy.trim().length > 0
    && input.targetHash.length > 0
    && input.targetHash === input.expectedTargetHash
    && decisionByGate[input.gate].includes(input.decision)
}

export type DispatchPacketHashes = Readonly<Record<string, string>>

function sortedPacketHashes(packetHashes: DispatchPacketHashes): Record<string, string> {
  return Object.fromEntries(Object.entries(packetHashes).sort(([left], [right]) => left.localeCompare(right)))
}

function boundedArtifactText(value: unknown, limit: number): string | undefined {
  return typeof value === 'string'
    ? value.slice(0, limit).replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>')
    : undefined
}

type DispatchRun = Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash'> & Partial<Pick<OrchestrationRun, 'nodes'>>

export function dispatchTargetHash(run: DispatchRun, nodeIds: readonly string[], packetHashes?: DispatchPacketHashes): string {
  return hashJson({
    runId: run.runId,
    requestId: run.requestId,
    planHash: run.planHash,
    nodeIds: [...nodeIds].sort(),
    executionContext: (run.nodes ?? [])
      .filter((record) => nodeIds.includes(record.node.nodeId))
      .map((record) => ({ nodeId: record.node.nodeId, state: record.state, resultHash: record.resultHash ?? null, childInputHash: record.childInputHash ?? null }))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    ...(packetHashes ? { packetHashes: sortedPacketHashes(packetHashes) } : {})
  })
}

export function nodeTargetHash(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash'>, record: Pick<OrchestrationNodeRecord, 'node'>): string {
  return hashJson({ runId: run.runId, requestId: run.requestId, planHash: run.planHash, nodeId: record.node.nodeId, nodeHash: hashJson(record.node) })
}

export function completionShapeTargetHash(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'requestHash'>, requestedOutput: string): string {
  return hashJson({ runId: run.runId, requestId: run.requestId, requestHash: run.requestHash, requestedOutput })
}

export function resultReviewTargetHash(runId: string, aggregateRef: string, aggregate: AggregateResult): string {
  return hashJson({ runId, aggregateRef, aggregateHash: hashJson(aggregate) })
}

export function artifactExportTargetHash(runId: string, aggregateRef: string, aggregateHash: string, nodes: readonly OrchestrationNodeRecord[]): string {
  return hashJson({ runId, aggregateRef, aggregateHash, nodes: nodes.map((record) => ({ nodeId: record.node.nodeId, childTaskId: record.childTaskId, childJobId: record.childJobId, threadId: record.threadId, resultRef: record.resultRef, resultHash: record.resultHash, childInputHash: record.childInputHash })).sort((left, right) => left.nodeId.localeCompare(right.nodeId)) })
}

export function nodeReviewTargetHash(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash'>, nodeId: string, resultHash: string | undefined, nextNodeIds: readonly string[]): string {
  return hashJson({ runId: run.runId, requestId: run.requestId, planHash: run.planHash, nodeId, resultHash: resultHash ?? null, nextNodeIds: [...nextNodeIds].sort() })
}

export function questionTargetHash(question: Pick<FrontdoorQuestion, 'questionId' | 'runId' | 'nodeId' | 'text'>): string {
  return hashJson({ questionId: question.questionId, runId: question.runId, nodeId: question.nodeId, text: question.text })
}

export function candidateReviewTargetHash(runId: string, candidateId: string, candidateHash: string, sourceResultHash: string, parentReviewDecisionId: string): string {
  return hashJson({ runId, candidateId, candidateHash, sourceResultHash, parentReviewDecisionId })
}


export function canDispatch(run: DispatchRun & Pick<OrchestrationRun, 'state'>, nodeIds: readonly string[], input: Omit<DecisionCheckInput, 'expectedTargetHash'>, packetHashes?: DispatchPacketHashes): boolean {
  return run.state === 'ready-for-approval'
    && input.gate === 'dispatch'
    && canApprove({ ...input, expectedTargetHash: dispatchTargetHash(run, nodeIds, packetHashes) })
}

export function canAnswer(question: Pick<FrontdoorQuestion, 'questionId' | 'runId' | 'nodeId' | 'text' | 'status'>, input: Omit<DecisionCheckInput, 'expectedTargetHash'> & { answerRef?: string; note?: string }): boolean {
  return question.status === 'open'
    && input.gate === 'question'
    && Boolean(input.answerRef || input.note?.trim())
    && canApprove({ ...input, expectedTargetHash: questionTargetHash(question) })
}

export function canReviewResult(input: DecisionCheckInput): boolean {
  return input.gate === 'result-review' && ['accept', 'follow-up', 'reject', 'stop'].includes(input.decision) && canApprove({ ...input, expectedTargetHash: input.expectedTargetHash })
}

export function canReviewNode(input: DecisionCheckInput): boolean {
  return input.gate === 'node-review' && input.decision === 'continue' && canApprove({ ...input, expectedTargetHash: input.expectedTargetHash })
}

export function canComplete(run: Pick<OrchestrationRun, 'state'>, input: Omit<DecisionCheckInput, 'expectedTargetHash'>, expectedTargetHash: string, resultReviewed: boolean): boolean {
  return run.state === 'awaiting-owner'
    && resultReviewed
    && input.gate === 'completion'
    && canApprove({ ...input, expectedTargetHash })
}

export function buildDecisionEnvelope(run: OrchestrationRun, gate: OwnerGate, decision: OwnerDecision, targetHash: string, approvedBy: string, now: string, options: Pick<OwnerDecisionEnvelope, 'nodeId' | 'note' | 'answerRef' | 'allowedCapability' | 'dataPolicy' | 'expiresAt'> = {}): OwnerDecisionEnvelope {
  return {
    decisionId: `owner-decision-${hashJson([run.runId, gate, decision, targetHash, approvedBy, now]).slice(0, 20)}`,
    runId: run.runId,
    requestId: run.requestId,
    gate,
    decision,
    targetHash,
    approvedBy,
    decidedAt: now,
    ...options
  }
}

async function assertDecisionBinding(runtimeRoot: string, envelope: OwnerDecisionEnvelope): Promise<OrchestrationRun> {
  const run = await readProjectedRun(runtimeRoot, envelope.runId)
  const request = await readRequest(runtimeRoot, envelope.runId)
  if (request.requestId !== envelope.requestId || run.requestId !== envelope.requestId) throw new Error('Owner Decision request binding mismatch')
  if (!envelope.targetHash || envelope.targetHash.length !== 64) throw new Error('Owner Decision target hash is invalid')
  return run
}

function assertAggregateBelongsToRun(runId: string, aggregate: AggregateResult): void {
  if (aggregate.runId !== runId) throw new Error('Aggregate Result belongs to another Run')
  if (aggregate.openQuestions.some((question) => question.runId !== runId)) throw new Error('Aggregate Question belongs to another Run')
}

function hasDecision(events: Awaited<ReturnType<typeof readRunEvents>>, gate: OwnerGate, decisions: readonly OwnerDecision[], targetHash: string): boolean {
  return events.some((event) => {
    if (event.type !== 'frontdoor.owner-decision-recorded') return false
    const decision = event.payload.decision as OwnerDecisionEnvelope | undefined
    return decision?.gate === gate && decisions.includes(decision.decision) && decision.targetHash === targetHash
  })
}

function latestResultReviewDecision(events: Awaited<ReturnType<typeof readRunEvents>>, targetHash: string): OwnerDecisionEnvelope | undefined {
  for (const event of [...events].reverse()) {
    if (event.type !== 'frontdoor.result-reviewed') continue
    const decision = event.payload.decision as OwnerDecisionEnvelope | undefined
    if (!decision || decision.gate !== 'result-review' || decision.targetHash !== targetHash) continue
    const recorded = events.some((candidate) => {
      if (candidate.type !== 'frontdoor.owner-decision-recorded') return false
      const stored = candidate.payload.decision as OwnerDecisionEnvelope | undefined
      return stored?.decisionId === decision.decisionId && hashJson(stored) === hashJson(decision)
    })
    return recorded ? decision : undefined
  }
  return undefined
}

function assertDecisionNotExpired(decision: OwnerDecisionEnvelope, now: string): void {
  if (!decision.expiresAt || !Number.isFinite(Date.parse(decision.expiresAt)) || Date.parse(decision.expiresAt) <= Date.parse(now)) throw new Error('Owner Decision is missing or past its expiry')
}

async function assertImplementationParentBindingCurrent(runtimeRoot: string, binding: ImplementationSourceBinding, now: string): Promise<void> {
  const parent = await readRun(runtimeRoot, binding.parentRunId)
  if (parent.aggregateResultRef !== binding.sourceAggregateRef) throw new Error('Implementation parent Aggregate binding changed')
  const aggregate = await readJson<AggregateResult>(await safeRuntimePath(runtimeRoot, binding.sourceAggregateRef))
  assertAggregateBelongsToRun(binding.parentRunId, aggregate)
  if (hashJson(aggregate) !== binding.sourceAggregateHash) throw new Error('Implementation parent Aggregate hash changed')
  const events = await readRunEvents(runtimeRoot, binding.parentRunId)
  const decision = latestResultReviewDecision(events, binding.parentReviewTargetHash)
  if (!decision || decision.decision !== 'accept' || decision.decisionId !== binding.parentReviewDecisionId || decision.targetHash !== binding.parentReviewTargetHash || decision.expiresAt !== binding.parentReviewExpiresAt) throw new Error('Implementation parent Result Review binding changed')
  assertDecisionNotExpired(decision, now)
}

async function readApprovedPacketHashes(runtimeRoot: string, run: OrchestrationRun, nodeIds: readonly string[]): Promise<DispatchPacketHashes | undefined> {
  const hashes: Record<string, string> = {}
  let missing = 0
  for (const nodeId of nodeIds) {
    const record = run.nodes.find((candidate) => candidate.node.nodeId === nodeId)
    if (!record) throw new Error(`Dispatch references an unknown Node: ${nodeId}`)
    try {
      const packet = await readJson<ApprovedTaskPacket>(path.join(runtimeRoot, 'approved-tasks', `${record.childTaskId}.json`))
      hashes[nodeId] = hashJson(packet)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        missing += 1
        continue
      }
      throw error
    }
  }
  if (missing === nodeIds.length) return undefined
  if (missing > 0) throw new Error('Dispatch approval packet set is incomplete')
  return hashes
}

export async function assertDispatchApproved(runtimeRoot: string, runId: string, nodeIds: readonly string[], packetHashes?: DispatchPacketHashes, requirePacketBinding = false): Promise<OwnerDecisionEnvelope> {
  const run = await readProjectedRun(runtimeRoot, runId)
  const expectedPacketHashes = packetHashes ?? await readApprovedPacketHashes(runtimeRoot, run, nodeIds)
  const packetBoundTargetHash = dispatchTargetHash(run, nodeIds, expectedPacketHashes)
  const legacyTargetHash = dispatchTargetHash(run, nodeIds)
  const events = await readRunEvents(runtimeRoot, runId)
  const allowedTargetHashes = requirePacketBinding ? [packetBoundTargetHash] : [packetBoundTargetHash, legacyTargetHash]
  const decision = events.find((event) => event.type === 'frontdoor.owner-decision-recorded'
    && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.gate === 'dispatch'
    && allowedTargetHashes.includes((event.payload.decision as OwnerDecisionEnvelope | undefined)?.targetHash ?? '')
    && ['dispatch', 'approve-selected'].includes(String((event.payload.decision as OwnerDecisionEnvelope).decision)))
  if (!decision) throw new Error(requirePacketBinding ? 'Frontdoor local-http dispatch requires a Packet-bound Owner Decision' : 'Frontdoor dispatch requires a matching Owner Decision')
  if (run.state !== 'ready-for-approval' || run.ownerGate !== 'awaiting-owner:dispatch') throw new Error('Frontdoor dispatch requires the current Dispatch Gate')
  const approvedTargetHash = (decision.payload.decision as OwnerDecisionEnvelope).targetHash
  if (events.some((event) => event.type === 'frontdoor.approval-bound' && event.payload.targetHash === approvedTargetHash)) throw new Error('Frontdoor Dispatch Decision has already been consumed')
  const packetBindingEstablished = approvedTargetHash === packetBoundTargetHash
  const approvedNodes = new Set(events.filter((event) => {
    if (event.type !== 'frontdoor.node-approved' || event.payload.targetHash !== approvedTargetHash || typeof event.payload.nodeTargetHash !== 'string') return false
    const record = run.nodes.find((candidate) => candidate.node.nodeId === event.payload.nodeId)
    return Boolean(record
      && event.payload.nodeTargetHash === nodeTargetHash(run, record)
      && (!packetBindingEstablished || event.payload.packetHash === expectedPacketHashes?.[String(event.payload.nodeId)]))
  }).map((event) => String(event.payload.nodeId)))
  if (nodeIds.some((nodeId) => !approvedNodes.has(nodeId))) throw new Error('Frontdoor dispatch has an unapproved Node')
  return decision.payload.decision as OwnerDecisionEnvelope
}

export interface FrontdoorOwnerGateServiceOptions {
  runtimeRoot: string
  clock?: () => Date
}

export class FrontdoorOwnerGateService {
  readonly runtimeRoot: string
  readonly clock: () => Date

  constructor({ runtimeRoot, clock = () => new Date() }: FrontdoorOwnerGateServiceOptions) {
    this.runtimeRoot = runtimeRoot
    this.clock = clock
  }

  private async recordDecision(runId: string, gate: OwnerGate, decision: OwnerDecision, targetHash: string, approvedBy: string, options: Pick<OwnerDecisionEnvelope, 'nodeId' | 'note' | 'answerRef'> = {}): Promise<OwnerDecisionEnvelope> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-${gate}-${process.pid}`)
    try {
      const run = await readProjectedRun(this.runtimeRoot, runId)
      const events = await readRunEvents(this.runtimeRoot, runId)
      const expectedGate = run.ownerGate?.startsWith('awaiting-owner:') ? run.ownerGate.slice('awaiting-owner:'.length) : undefined
      if (expectedGate !== gate) throw new Error(`Owner Decision gate mismatch: expected ${expectedGate ?? 'none'}, received ${gate}`)
      const existing = [...events].reverse().find((event) => {
        if (event.type !== 'frontdoor.owner-decision-recorded') return false
        const stored = event.payload.decision as OwnerDecisionEnvelope | undefined
        return stored?.gate === gate && stored.decision === decision && stored.targetHash === targetHash
      })
      if (existing) {
        const stored = existing.payload.decision as OwnerDecisionEnvelope
        if (stored.approvedBy !== approvedBy) throw new Error('Owner Decision already exists for this target with another Owner identity')
        return stored
      }
      const envelope = buildDecisionEnvelope(run, gate, decision, targetHash, approvedBy, this.clock().toISOString(), options)
      if (!canApprove({ gate, decision, targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error(`Owner Decision is invalid for ${gate}`)
      await assertDecisionBinding(this.runtimeRoot, envelope)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
      return envelope
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async approveIntake(runId: string, approvedBy = 'Project Owner', note?: string): Promise<OwnerDecisionEnvelope> {
    const request = await readRequest(this.runtimeRoot, runId)
    return this.recordDecision(runId, 'intake', 'proceed', request.inputHash, approvedBy, { note })
  }

  async approveCompletionShape(runId: string, approvedBy = 'Project Owner', note?: string): Promise<OwnerDecisionEnvelope> {
    const run = await readProjectedRun(this.runtimeRoot, runId)
    const request = await readRequest(this.runtimeRoot, runId)
    return this.recordDecision(runId, 'completion-shape', 'approve', completionShapeTargetHash(run, request.requestedOutput), approvedBy, { note })
  }

  async approveDecomposition(runId: string, approvedBy = 'Project Owner', note?: string): Promise<OwnerDecisionEnvelope> {
    const plan = await readPlan(this.runtimeRoot, runId)
    return this.recordDecision(runId, 'decomposition', 'approve-selected', plan.planHash, approvedBy, { note })
  }

  async approveDispatch(runId: string, nodeIds: readonly string[], approvedBy: string, note?: string): Promise<OwnerDecisionEnvelope> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-dispatch-${process.pid}`)
    try {
      const run = await readProjectedRun(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
      if (run.ownerGate !== 'awaiting-owner:dispatch') throw new Error('Dispatch approval requires the current Dispatch Gate')
      const expectedNodeIds = plan.nodes.map((node) => node.nodeId).sort()
      const selectedNodeIds = [...new Set(nodeIds)].sort()
      if (selectedNodeIds.join('|') !== expectedNodeIds.join('|')) throw new Error('Dispatch approval must identify the exact Node set')
      const request = await readRequest(this.runtimeRoot, runId)
      const events = await readRunEvents(this.runtimeRoot, runId)
      if (!hasDecision(events, 'intake', ['proceed'], request.inputHash)) throw new Error('Dispatch requires an approved Intake')
      if (!hasDecision(events, 'completion-shape', ['approve'], completionShapeTargetHash(run, request.requestedOutput))) throw new Error('Dispatch requires an approved Completion Shape')
      if (!hasDecision(events, 'decomposition', ['approve-selected'], plan.planHash)) throw new Error('Dispatch requires an approved Decomposition')
      const packetHashes = await readApprovedPacketHashes(this.runtimeRoot, run, selectedNodeIds)
      const targetHash = dispatchTargetHash(run, selectedNodeIds, packetHashes)
      const envelope = buildDecisionEnvelope(run, 'dispatch', 'dispatch', targetHash, approvedBy, this.clock().toISOString(), { note })
      if (!canDispatch(run, selectedNodeIds, envelope, packetHashes)) throw new Error('Dispatch approval is invalid or stale')
      const existing = (await readRunEvents(this.runtimeRoot, runId)).find((event) => event.type === 'frontdoor.owner-decision-recorded' && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.gate === 'dispatch' && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.targetHash === targetHash)
      if (existing) {
        const stored = existing.payload.decision as OwnerDecisionEnvelope
        if (stored.approvedBy !== approvedBy) throw new Error('Dispatch Decision already exists for this target with another Owner identity')
        return stored
      }
      await assertDecisionBinding(this.runtimeRoot, envelope)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
      for (const nodeId of selectedNodeIds) {
        const record = run.nodes.find((candidate) => candidate.node.nodeId === nodeId)
        if (!record) throw new Error(`Dispatch approval references an unknown Node: ${nodeId}`)
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-approved', {
          nodeId,
          targetHash,
          nodeTargetHash: nodeTargetHash(run, record),
          ...(packetHashes ? { packetHash: packetHashes[nodeId] } : {}),
          decisionId: envelope.decisionId
        })
      }
      return envelope
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async answerQuestion(runId: string, question: FrontdoorQuestion, approvedBy: string, answerRef?: string, note?: string): Promise<OwnerDecisionEnvelope> {
    const run = await readProjectedRun(this.runtimeRoot, runId)
    if (!run.aggregateResultRef) throw new Error('Question answer requires a persisted aggregate')
    const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
    assertAggregateBelongsToRun(runId, aggregate)
    const currentQuestion = aggregate.openQuestions.find((candidate) => candidate.questionId === question.questionId)
    if (!currentQuestion || currentQuestion.status !== 'open') throw new Error('Question answer must reference the current open Question')
    const targetHash = questionTargetHash(currentQuestion)
    const envelope = buildDecisionEnvelope(run, 'question', 'answer', targetHash, approvedBy, this.clock().toISOString(), { nodeId: currentQuestion.nodeId, answerRef, note })
    if (!canAnswer(currentQuestion, envelope)) throw new Error('Question answer requires an open question and explicit Owner content')
    await assertDecisionBinding(this.runtimeRoot, envelope)
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
    const resumed = {
      ...run,
      state: 'ready-for-approval' as const,
      ownerGate: 'awaiting-owner:dispatch' as const,
      approvalIds: [],
      openQuestionIds: run.openQuestionIds.filter((id) => id !== question.questionId),
      aggregateResultRef: undefined,
      nodes: run.nodes.map((record) => record.state === 'awaiting-question' || (record.state === 'cancelled' && record.error === 'blocked by Owner question')
        ? { ...record, state: 'queued' as const, childJobId: undefined, threadId: undefined, resultStatus: undefined, resultRef: undefined, resultHash: undefined, childInputHash: undefined, questionIds: [], error: undefined }
        : record),
      updatedAt: this.clock().toISOString()
    }
    await writeRun(this.runtimeRoot, resumed)
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.question-answered', { questionId: question.questionId, targetHash, decisionId: envelope.decisionId, answerRef, note, nodeRecords: resumed.nodes, runState: resumed.state })
    return envelope
  }

  async reviewResult(runId: string, approvedBy: string, decision: 'accept' | 'follow-up' | 'reject' = 'accept', note?: string): Promise<OwnerDecisionEnvelope> {
    const run = await readProjectedRun(this.runtimeRoot, runId)
    if (!run.aggregateResultRef) throw new Error('Result review requires a proposed aggregate')
    const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
    assertAggregateBelongsToRun(runId, aggregate)
    const events = await readRunEvents(this.runtimeRoot, runId)
    const proposed = events.find((event) => event.type === 'frontdoor.completion-proposed' && event.payload.aggregateRef === run.aggregateResultRef)
    if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error('Result review aggregate does not match the proposed Evidence')
    if (run.runKind === 'implementation' && run.implementationBinding) {
      await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString())
      for (const record of run.nodes) {
        if (!record.resultRef) throw new Error(`Implementation Result Review requires a Result: ${record.node.nodeId}`)
        const result = await readJson<Record<string, unknown>>(await safeRuntimePath(this.runtimeRoot, record.resultRef))
        validateImplementationCandidate(result.artifact, record.node.scope.inScope)
      }
    }
    const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate)
    const decidedAt = this.clock().toISOString()
    const envelope = buildDecisionEnvelope(run, 'result-review', decision, targetHash, approvedBy, decidedAt, { note, expiresAt: new Date(this.clock().getTime() + 60 * 60 * 1000).toISOString() })
    if (!canReviewResult({ gate: 'result-review', decision, targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error('Result review decision is invalid')
    await assertDecisionBinding(this.runtimeRoot, envelope)
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.result-reviewed', { decision: envelope, aggregateRef: run.aggregateResultRef, aggregateHash: hashJson(aggregate) })
    if (decision === 'accept') await writeRun(this.runtimeRoot, { ...run, ownerGate: 'awaiting-owner:completion', updatedAt: this.clock().toISOString() })
    return envelope
  }

  async reviewNode(runId: string, nodeId: string, approvedBy: string, decision: 'continue' | 'stop' = 'continue', note?: string): Promise<OwnerDecisionEnvelope> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-node-review-${process.pid}`)
    try {
      const run = await readProjectedRun(this.runtimeRoot, runId)
      const review = run.nodeReview
      if (run.state !== 'awaiting-owner' || run.ownerGate !== 'awaiting-owner:node-review' || !review || review.nodeId !== nodeId) throw new Error('Node review is not the current Owner Gate')
      const targetHash = nodeReviewTargetHash(run, review.nodeId, review.resultHash, review.nextNodeIds)
      if (review.targetHash !== targetHash) throw new Error('Node review target is stale or tampered')
      const envelope = buildDecisionEnvelope(run, 'node-review', decision, targetHash, approvedBy, this.clock().toISOString(), { nodeId, note })
      if (decision !== 'continue' && decision !== 'stop') throw new Error('Node review decision is invalid')
      if (!canApprove({ gate: 'node-review', decision, targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error('Node review decision is invalid')
      await assertDecisionBinding(this.runtimeRoot, envelope)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
      if (decision === 'stop') {
        const stopped = { ...run, state: 'cancelled' as const, ownerGate: 'stopped' as const, nodeReview: undefined, nodes: run.nodes.map((node) => ['queued', 'ready', 'running', 'recovery-needed', 'awaiting-question'].includes(node.state) ? { ...node, state: 'cancelled' as const, error: note ?? 'Owner stopped after Node review' } : node), updatedAt: this.clock().toISOString() }
        await writeRun(this.runtimeRoot, stopped)
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.run-stopped', { note: note ?? 'Owner stopped after Node review', nodeRecords: stopped.nodes, runState: stopped.state })
        return envelope
      }
      const resumed = { ...run, state: 'ready-for-approval' as const, ownerGate: 'awaiting-owner:dispatch' as const, approvalIds: [], nodeReview: undefined, updatedAt: this.clock().toISOString() }
      await writeRun(this.runtimeRoot, resumed)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-review-continued', { nodeId, targetHash, decisionId: envelope.decisionId, nextNodeIds: review.nextNodeIds, runState: resumed.state })
      return envelope
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async completeRun(runId: string, approvedBy: string, note?: string): Promise<OrchestrationRun> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-completion-${process.pid}`)
    try {
      const run = await readProjectedRun(this.runtimeRoot, runId)
      if (!run.aggregateResultRef) throw new Error('Completion requires a proposed aggregate')
      const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
      if (aggregate.openQuestions.length > 0) throw new Error('Completion requires all blocking questions to be resolved')
      const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate)
      assertAggregateBelongsToRun(runId, aggregate)
      const events = await readRunEvents(this.runtimeRoot, runId)
      const reviewDecision = latestResultReviewDecision(events, targetHash)
      const reviewed = reviewDecision?.decision === 'accept'
      if (reviewDecision?.decision === 'accept') assertDecisionNotExpired(reviewDecision, this.clock().toISOString())
      const envelope = buildDecisionEnvelope(run, 'completion', 'complete', targetHash, approvedBy, this.clock().toISOString(), { note })
      if (!canComplete(run, envelope, targetHash, reviewed)) throw new Error('Completion requires an accepted Result review bound to the current aggregate')
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.completion-approved', { decision: envelope })
      const completed = { ...run, state: 'complete' as const, ownerGate: 'completed' as const, updatedAt: this.clock().toISOString() }
      await writeRun(this.runtimeRoot, completed)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.run-completed', { status: 'complete', aggregateRef: run.aggregateResultRef, openQuestionIds: [], runState: 'complete' })
      return completed
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async exportWorkPlaneArtifact(runId: string, approvedBy: string, note?: string): Promise<WorkPlaneArtifactManifest> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-artifact-export-${process.pid}`)
    try {
      const run = await readProjectedRun(this.runtimeRoot, runId)
      const request = await readRequest(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
      await assertRunIntegrity(this.runtimeRoot, run, request, plan)
      const events = await readRunEvents(this.runtimeRoot, runId)
      assertRunEventConsistency(run, events)
      if (run.state !== 'awaiting-owner' || !run.aggregateResultRef) throw new Error('Work Plane export requires an accepted Result Review before completion')
      const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
      assertAggregateBelongsToRun(runId, aggregate)
      const proposed = events.find((event) => event.type === 'frontdoor.completion-proposed' && event.payload.aggregateRef === run.aggregateResultRef)
      if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error('Work Plane export aggregate does not match proposed Evidence')
      const reviewTargetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate)
      const reviewDecision = latestResultReviewDecision(events, reviewTargetHash)
      if (!reviewDecision || reviewDecision.decision !== 'accept') throw new Error('Work Plane export requires an accepted Result Review; the latest Result Review is not accepted')
      assertDecisionNotExpired(reviewDecision, this.clock().toISOString())
      if (run.runKind === 'implementation' && run.implementationBinding) {
        await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString())
        await assertImplementationSourceArtifacts(this.runtimeRoot, run.implementationBinding)
      }
      const records = run.nodes.map((record) => {
        if (!record.childTaskId || !record.childJobId || !record.threadId || !record.resultRef || !record.resultHash || !record.evidenceHash || !record.childInputHash) throw new Error(`Work Plane export evidence is incomplete: ${record.node.nodeId}`)
        if (!record.node.capabilities.includes('propose')) throw new Error(`Work Plane export requires the propose capability: ${record.node.nodeId}`)
        if (getAdapterProfile(record.node.adapterId).dataPolicy !== 'local-only') throw new Error(`Work Plane export requires a local-only Adapter: ${record.node.adapterId}`)
        return record
      })
      const targetHash = artifactExportTargetHash(runId, run.aggregateResultRef, hashJson(aggregate), run.nodes)
      const createdAt = this.clock().toISOString()
      const envelope = buildDecisionEnvelope(run, 'artifact-export', 'export', targetHash, approvedBy, createdAt, { note, allowedCapability: 'propose', dataPolicy: 'local-only', expiresAt: new Date(this.clock().getTime() + 5 * 60 * 1000).toISOString() })
      if (!canApprove({ gate: 'artifact-export', decision: 'export', targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error('Work Plane export decision is invalid')
      assertDecisionNotExpired(envelope, createdAt)
      const results = await Promise.all(records.map(async (record) => {
        const result = await readJson<Record<string, unknown>>(await safeRuntimePath(this.runtimeRoot, record.resultRef!))
        if (hashJson(result) !== record.resultHash) throw new Error(`Work Plane export Result hash mismatch: ${record.node.nodeId}`)
        if (result.taskId !== record.childTaskId || result.jobId !== record.childJobId || result.adapterId !== record.node.adapterId || result.role !== record.node.role || result.inputHash !== record.childInputHash || result.orchestrationRunId !== runId) throw new Error(`Work Plane export Result binding mismatch: ${record.node.nodeId}`)
        const jobRequest = await readJson<JobRequest>(await safeRuntimePath(this.runtimeRoot, `jobs/${record.childJobId}/request.json`))
        const jobSelection = jobRequest.task.adapterPlan.selections.length === 1 ? jobRequest.task.adapterPlan.selections[0] : undefined
        if (jobRequest.jobId !== record.childJobId || jobRequest.inputHash !== record.childInputHash || jobRequest.inputHash !== hashJson(jobRequest.task) || jobRequest.task.taskId !== record.childTaskId || jobRequest.task.objective !== record.node.objective || jobSelection?.adapterId !== record.node.adapterId || jobSelection.role !== record.node.role || (run.runKind === 'implementation' && hashJson(jobRequest.task.implementationBinding) !== hashJson(run.implementationBinding))) throw new Error(`Work Plane export Job binding mismatch: ${record.node.nodeId}`)
        const thread = await readJson<Record<string, unknown> & { turns?: Array<Record<string, unknown>> }>(await safeRuntimePath(this.runtimeRoot, `threads/${record.threadId}/thread.json`))
        if (thread.threadId !== record.threadId || thread.taskId !== record.childTaskId || thread.jobId !== record.childJobId || (run.runKind === 'implementation' && hashJson(thread.implementationBinding) !== hashJson(run.implementationBinding))) throw new Error(`Work Plane export Thread binding mismatch: ${record.node.nodeId}`)
        if (!thread.turns?.some((turn) => turn.resultEnvelopeRef === record.resultRef && turn.resultEnvelopeHash === record.resultHash && turn.orchestrationRunId === runId)) throw new Error(`Work Plane export Thread turn binding mismatch: ${record.node.nodeId}`)
        const evidence = await readJson<Record<string, unknown> & { turns?: Array<Record<string, unknown>> }>(await safeRuntimePath(this.runtimeRoot, `threads/${record.threadId}/evidence-links.json`))
        if (evidence.threadId !== record.threadId || evidence.taskId !== record.childTaskId || evidence.jobId !== record.childJobId || hashJson(evidence) !== record.evidenceHash || !evidence.turns?.some((turn) => turn.resultEnvelopeRef === record.resultRef && turn.resultEnvelopeHash === record.resultHash)) throw new Error(`Work Plane export Evidence binding mismatch: ${record.node.nodeId}`)
        const candidate = run.runKind === 'implementation' ? validateImplementationCandidate(result.artifact, record.node.scope.inScope) : undefined
        return { nodeId: record.node.nodeId, taskId: record.childTaskId, jobId: record.childJobId, threadId: record.threadId, resultRef: record.resultRef, resultHash: record.resultHash, inputHash: record.childInputHash, adapterId: record.node.adapterId, role: record.node.role, result: { status: result.status, summary: boundedArtifactText(result.summary, 2_000), content: boundedArtifactText(result.content, 12_000), verification: result.verification, risks: result.risks }, ...(candidate ? { candidate } : {}) }
      }))
      const artifactId = `artifact-${hashJson([runId, targetHash]).slice(0, 20)}`
      const relativePath = `frontdoor-runs/${runId}/work-plane/${artifactId}.json`
      const content = { artifactId, runId, requestId: run.requestId, requestHash: run.requestHash, planHash: run.planHash, aggregateRef: run.aggregateResultRef, aggregateHash: hashJson(aggregate), nodes: results, exportedAt: createdAt }
      const candidate = run.runKind === 'implementation' ? results[0].candidate : undefined
      const manifest: WorkPlaneArtifactManifest = { artifactId, runId, requestId: run.requestId, taskId: records[0].childTaskId, nodeId: records.length === 1 ? records[0].node.nodeId : 'aggregate', jobId: records.length === 1 ? records[0].childJobId! : 'multiple', threadId: records.length === 1 ? records[0].threadId! : 'multiple', requestHash: run.requestHash, planHash: run.planHash, resultHash: hashJson(results.map((result) => ({ nodeId: result.nodeId, resultHash: result.resultHash }))), aggregateHash: hashJson(aggregate), contentHash: hashJson(content), resultRef: records[0].resultRef!, relativePath, contentType: 'application/json', ownerDecisionIds: [reviewDecision.decisionId, envelope.decisionId], createdAt, status: 'exported', ...(candidate ? { candidateKind: candidate.kind, candidateHash: candidate.candidateHash, candidateFiles: candidate.files.map((file) => ({ relativePath: file.relativePath, contentHash: file.contentHash })), parentRunId: run.implementationBinding?.parentRunId, sourceAggregateRef: run.implementationBinding?.sourceAggregateRef, sourceAggregateHash: run.implementationBinding?.sourceAggregateHash, sourceResultHash: run.implementationBinding?.sourceResultHash, contextBundleHash: run.implementationBinding?.contextBundleHash } : {}) }
      const runDirectory = await safeRuntimePath(this.runtimeRoot, `frontdoor-runs/${runId}`)
      const workPlaneDirectory = path.join(runDirectory, 'work-plane')
      await assertDecisionBinding(this.runtimeRoot, envelope)
      await assertNoSymlinkComponents(runDirectory, workPlaneDirectory)
      try {
        await mkdir(workPlaneDirectory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Work Plane export is blocked by an existing or incomplete artifact state (recovery-needed)')
        throw error
      }
      const artifactPath = path.join(workPlaneDirectory, `${artifactId}.json`)
      const temporaryArtifactPath = path.join(workPlaneDirectory, `${artifactId}.${process.pid}.${Date.now()}.tmp`)
      try {
        await writeFile(temporaryArtifactPath, `${JSON.stringify({ manifest, content }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
        await link(temporaryArtifactPath, artifactPath)
        await rm(temporaryArtifactPath, { force: true })
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope, artifact: manifest })
      } catch (error) {
        await rm(temporaryArtifactPath, { force: true })
        try {
          await writeFile(path.join(workPlaneDirectory, 'recovery-needed.json'), `${JSON.stringify({ runId, artifactId, reason: 'artifact export interrupted before Ledger binding', detectedAt: this.clock().toISOString() })}\n`, { encoding: 'utf8', flag: 'wx' })
        } catch {
          // Preserve the original failure. The directory itself remains as a recovery signal.
        }
        throw error
      }
      return manifest
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async listReviewableCandidates(): Promise<CandidateSummary[]> {
    const runsDir = path.join(this.runtimeRoot, 'frontdoor-runs')
    let runDirs: string[] = []
    try {
      const entries = await readdir(runsDir, { withFileTypes: true })
      runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    const summaries: CandidateSummary[] = []
    for (const runId of runDirs) {
      const workPlaneDir = path.join(runsDir, runId, 'work-plane')
      let files: string[] = []
      try {
        const entries = await readdir(workPlaneDir, { withFileTypes: true })
        files = entries.filter((e) => e.isFile() && e.name.startsWith('artifact-') && e.name.endsWith('.json')).map((e) => e.name)
      } catch {
        continue
      }
      if (files.length === 0) continue

      const events = await readRunEvents(this.runtimeRoot, runId).catch(() => [])
      for (const file of files) {
        const artifactPath = path.join(workPlaneDir, file)
        try {
          const raw = await readJson<{ manifest: WorkPlaneArtifactManifest; content: { nodes: Array<{ candidate?: { files: Array<{ content: string }> } }> } }>(artifactPath)
          const manifest = raw.manifest
          if (manifest.candidateKind !== 'candidate-file-set' || !manifest.candidateHash) continue

          const candidateId = manifest.artifactId
          const candidateEvents = events.filter((e) => (e.payload as Record<string, unknown>).candidateId === candidateId || ((e.payload as Record<string, unknown>).decision as Record<string, unknown> | undefined)?.candidateId === candidateId)

          let state: CandidateReviewState = 'generated'
          const reviewed = [...candidateEvents].reverse().find((e) => e.type === 'frontdoor.candidate-reviewed' || (e.type === 'frontdoor.owner-decision-recorded' && ((e.payload as Record<string, unknown>).decision as Record<string, unknown> | undefined)?.gate === 'candidate-review'))
          if (reviewed) {
            const decisionEnvelope = (reviewed.payload as Record<string, unknown>).decision as Record<string, unknown> | undefined
            const decision = String(decisionEnvelope?.decision ?? (reviewed.payload as Record<string, unknown>).decision)
            if (decision === 'accept') state = 'accepted'
            else if (decision === 'reject') state = 'rejected'
            else if (decision === 'follow-up') state = 'follow-up'
          } else if (candidateEvents.some((e) => e.type === 'frontdoor.candidate-review-started')) {
            state = 'owner-review'
          }

          const fileCount = manifest.candidateFiles?.length ?? 0
          const totalBytes = raw.content?.nodes?.[0]?.candidate?.files?.reduce((sum, f) => sum + Buffer.byteLength(f.content ?? '', 'utf8'), 0) ?? 0

          summaries.push({
            candidateId,
            parentRunId: manifest.parentRunId ?? '',
            childRunId: runId,
            candidateHash: manifest.candidateHash,
            fileCount,
            totalBytes,
            state,
            exportedAt: manifest.createdAt
          })
        } catch {
          continue
        }
      }
    }
    return summaries.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt))
  }

  async inspectCandidate(candidateId: string): Promise<CandidateInspectionResult> {
    const summaries = await this.listReviewableCandidates()
    const summary = summaries.find((s) => s.candidateId === candidateId)
    if (!summary) throw new Error(`Candidate not found: ${candidateId}`)

    const relativePath = `frontdoor-runs/${summary.childRunId}/work-plane/${candidateId}.json`
    const artifactPath = path.join(this.runtimeRoot, relativePath)
    const raw = await readJson<{ manifest: WorkPlaneArtifactManifest; content: { nodes: Array<{ candidate?: import('../../shared/implementationTypes').ImplementationCandidate }> } }>(artifactPath)
    const { manifest, content } = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, summary.childRunId, raw.manifest)
    if (manifest.artifactId !== candidateId || manifest.candidateKind !== 'candidate-file-set') throw new Error(`Invalid Candidate artifact: ${candidateId}`)

    const typedContent = content as { nodes: Array<{ candidate?: import('../../shared/implementationTypes').ImplementationCandidate }> }
    const node = typedContent.nodes.find((n) => n.candidate)
    if (!node?.candidate) throw new Error(`Candidate payload missing in artifact: ${candidateId}`)


    const run = await readRun(this.runtimeRoot, summary.childRunId)
    if (!run.implementationBinding) throw new Error(`Candidate implementation binding missing: ${candidateId}`)

    await this.startCandidateReview(candidateId)

    const updatedSummaries = await this.listReviewableCandidates()
    const updatedSummary = updatedSummaries.find((s) => s.candidateId === candidateId) ?? summary

    const targetHash = candidateReviewTargetHash(
      summary.childRunId,
      candidateId,
      manifest.candidateHash!,
      run.implementationBinding.sourceResultHash,
      run.implementationBinding.parentReviewDecisionId
    )

    return {
      summary: updatedSummary,
      candidate: node.candidate,
      binding: run.implementationBinding,
      manifest: manifest as unknown as Record<string, unknown>,
      state: updatedSummary.state,
      targetHash
    }
  }



  async startCandidateReview(candidateId: string): Promise<CandidateReviewStartedResult> {
    const summaries = await this.listReviewableCandidates()
    const summary = summaries.find((s) => s.candidateId === candidateId)
    if (!summary) throw new Error(`Candidate not found: ${candidateId}`)

    const events = await readRunEvents(this.runtimeRoot, summary.childRunId)
    const existing = events.find((e) => e.type === 'frontdoor.candidate-review-started' && (e.payload as Record<string, unknown>).candidateId === candidateId)

    const startedAt = (existing?.payload as Record<string, unknown>)?.startedAt as string ?? this.clock().toISOString()

    if (!existing) {
      await recordRunEvent(this.runtimeRoot, summary.childRunId, 'frontdoor.candidate-review-started', {
        candidateId,
        startedAt
      })
    }

    return { candidateId, state: 'owner-review', startedAt }
  }

  async reviewCandidate(input: CandidateReviewDecisionInput): Promise<CandidateReviewOwnerDecisionEnvelope> {
    if (!input.approvedBy || input.approvedBy.trim().length === 0) throw new Error('approvedBy is required')
    if (!['accept', 'reject', 'follow-up'].includes(input.decision)) throw new Error(`Invalid candidate decision: ${input.decision}`)

    const summaries = await this.listReviewableCandidates()
    const summary = summaries.find((s) => s.candidateId === input.candidateId)
    if (!summary) throw new Error(`Candidate not found: ${input.candidateId}`)

    if (summary.state === 'accepted' || summary.state === 'rejected' || summary.state === 'follow-up') {
      throw new Error(`Candidate review is already in a terminal state: ${summary.state}`)
    }

    const events = await readRunEvents(this.runtimeRoot, summary.childRunId)
    const started = events.find((e) => e.type === 'frontdoor.candidate-review-started' && (e.payload as Record<string, unknown>).candidateId === input.candidateId)
    if (!started) throw new Error('candidate review was not started')

    const relativePath = `frontdoor-runs/${summary.childRunId}/work-plane/${input.candidateId}.json`
    const artifactPath = path.join(this.runtimeRoot, relativePath)
    const raw = await readJson<{ manifest: WorkPlaneArtifactManifest }>(artifactPath)
    const { manifest } = await readVerifiedWorkPlaneArtifact(this.runtimeRoot, summary.childRunId, raw.manifest)
    if (manifest.artifactId !== input.candidateId || manifest.candidateKind !== 'candidate-file-set' || manifest.candidateHash !== summary.candidateHash) {
      throw new Error('candidate artifact hash mismatch')
    }


    const run = await readRun(this.runtimeRoot, summary.childRunId)
    if (!run.implementationBinding) throw new Error('candidate binding mismatch')

    await assertImplementationParentBindingCurrent(this.runtimeRoot, run.implementationBinding, this.clock().toISOString())
    await assertImplementationSourceArtifacts(this.runtimeRoot, run.implementationBinding)

    const expectedTargetHash = candidateReviewTargetHash(
      summary.childRunId,
      input.candidateId,
      manifest.candidateHash,
      run.implementationBinding.sourceResultHash,
      run.implementationBinding.parentReviewDecisionId
    )

    if (input.targetHash !== expectedTargetHash) {
      throw new Error(`candidate review target hash mismatch: expected ${expectedTargetHash}, got ${input.targetHash}`)
    }

    const decidedAt = this.clock().toISOString()
    const expiresAt = new Date(this.clock().getTime() + 60 * 60 * 1000).toISOString()

    const decisionId = `owner-decision-${hashJson([summary.childRunId, 'candidate-review', input.candidateId, input.decision, input.targetHash, input.approvedBy, decidedAt]).slice(0, 20)}`

    const envelope: CandidateReviewOwnerDecisionEnvelope = {
      decisionId,
      runId: summary.childRunId,
      requestId: run.requestId,
      taskId: manifest.taskId,
      candidateId: input.candidateId,
      candidateHash: manifest.candidateHash,
      targetHash: input.targetHash,
      approvedBy: input.approvedBy,
      capability: 'candidate-review',
      decidedAt,
      expiresAt,
      decision: input.decision,
      note: input.note
    }

    const genericEnvelope: OwnerDecisionEnvelope = {
      decisionId,
      runId: summary.childRunId,
      requestId: run.requestId,
      gate: 'candidate-review',
      decision: input.decision,
      targetHash: input.targetHash,
      approvedBy: input.approvedBy,
      decidedAt,
      allowedCapability: 'propose',
      dataPolicy: 'local-only',
      expiresAt,
      note: input.note
    }

    await recordRunEvent(this.runtimeRoot, summary.childRunId, 'frontdoor.owner-decision-recorded', {
      decision: genericEnvelope,
      candidateId: input.candidateId
    })

    await recordRunEvent(this.runtimeRoot, summary.childRunId, 'frontdoor.candidate-reviewed', {
      decision: envelope,
      candidateId: input.candidateId,
      state: input.decision
    })

    return envelope
  }
}
