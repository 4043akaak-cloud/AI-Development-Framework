import path from 'node:path'
import type { ApprovedTaskPacket } from '../../shared/jobLoopTypes'
import type { AggregateResult, FrontdoorQuestion, OwnerDecision, OwnerDecisionEnvelope, OwnerGate, OrchestrationNodeRecord, OrchestrationRun } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson } from '../jobLoop/ledger'
import { claimRun, readPlan, readRequest, readRun, readRunEvents, recordRunEvent, releaseRun, writeRun } from './ledger'

const decisionByGate: Record<OwnerGate, readonly OwnerDecision[]> = {
  intake: ['clarify', 'edit', 'reject', 'proceed', 'stop'],
  'completion-shape': ['edit', 'approve', 'reject', 'stop'],
  decomposition: ['edit', 'approve-selected', 'reject', 'stop'],
  dispatch: ['dispatch', 'approve-selected', 'defer', 'stop'],
  'node-review': ['continue', 'stop'],
  question: ['answer', 'revise-plan', 'stop'],
  'result-review': ['accept', 'follow-up', 'reject', 'stop'],
  completion: ['approve', 'continue', 'stop', 'complete']
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

export function dispatchTargetHash(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash'>, nodeIds: readonly string[], packetHashes?: DispatchPacketHashes): string {
  return hashJson({
    runId: run.runId,
    requestId: run.requestId,
    planHash: run.planHash,
    nodeIds: [...nodeIds].sort(),
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

export function nodeReviewTargetHash(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash'>, nodeId: string, resultHash: string | undefined, nextNodeIds: readonly string[]): string {
  return hashJson({ runId: run.runId, requestId: run.requestId, planHash: run.planHash, nodeId, resultHash: resultHash ?? null, nextNodeIds: [...nextNodeIds].sort() })
}

export function questionTargetHash(question: Pick<FrontdoorQuestion, 'questionId' | 'runId' | 'nodeId' | 'text'>): string {
  return hashJson({ questionId: question.questionId, runId: question.runId, nodeId: question.nodeId, text: question.text })
}

export function canDispatch(run: Pick<OrchestrationRun, 'runId' | 'requestId' | 'planHash' | 'state'>, nodeIds: readonly string[], input: Omit<DecisionCheckInput, 'expectedTargetHash'>, packetHashes?: DispatchPacketHashes): boolean {
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

export function buildDecisionEnvelope(run: OrchestrationRun, gate: OwnerGate, decision: OwnerDecision, targetHash: string, approvedBy: string, now: string, options: Pick<OwnerDecisionEnvelope, 'nodeId' | 'note' | 'answerRef'> = {}): OwnerDecisionEnvelope {
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
  const run = await readRun(runtimeRoot, envelope.runId)
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

export async function assertDispatchApproved(runtimeRoot: string, runId: string, nodeIds: readonly string[], packetHashes?: DispatchPacketHashes, requirePacketBinding = false): Promise<void> {
  const run = await readRun(runtimeRoot, runId)
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
  const approvedTargetHash = (decision.payload.decision as OwnerDecisionEnvelope).targetHash
  const packetBindingEstablished = approvedTargetHash === packetBoundTargetHash
  const approvedNodes = new Set(events.filter((event) => {
    if (event.type !== 'frontdoor.node-approved' || event.payload.targetHash !== approvedTargetHash || typeof event.payload.nodeTargetHash !== 'string') return false
    const record = run.nodes.find((candidate) => candidate.node.nodeId === event.payload.nodeId)
    return Boolean(record
      && event.payload.nodeTargetHash === nodeTargetHash(run, record)
      && (!packetBindingEstablished || event.payload.packetHash === expectedPacketHashes?.[String(event.payload.nodeId)]))
  }).map((event) => String(event.payload.nodeId)))
  if (nodeIds.some((nodeId) => !approvedNodes.has(nodeId))) throw new Error('Frontdoor dispatch has an unapproved Node')
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
    const run = await readRun(this.runtimeRoot, runId)
    const envelope = buildDecisionEnvelope(run, gate, decision, targetHash, approvedBy, this.clock().toISOString(), options)
    if (!canApprove({ gate, decision, targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error(`Owner Decision is invalid for ${gate}`)
    await assertDecisionBinding(this.runtimeRoot, envelope)
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
    return envelope
  }

  async approveIntake(runId: string, approvedBy = 'Project Owner', note?: string): Promise<OwnerDecisionEnvelope> {
    const request = await readRequest(this.runtimeRoot, runId)
    return this.recordDecision(runId, 'intake', 'proceed', request.inputHash, approvedBy, { note })
  }

  async approveCompletionShape(runId: string, approvedBy = 'Project Owner', note?: string): Promise<OwnerDecisionEnvelope> {
    const run = await readRun(this.runtimeRoot, runId)
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
      const run = await readRun(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
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
    const run = await readRun(this.runtimeRoot, runId)
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
    const run = await readRun(this.runtimeRoot, runId)
    if (!run.aggregateResultRef) throw new Error('Result review requires a proposed aggregate')
    const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
    assertAggregateBelongsToRun(runId, aggregate)
    const events = await readRunEvents(this.runtimeRoot, runId)
    const proposed = events.find((event) => event.type === 'frontdoor.completion-proposed' && event.payload.aggregateRef === run.aggregateResultRef)
    if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error('Result review aggregate does not match the proposed Evidence')
    const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate)
    const envelope = buildDecisionEnvelope(run, 'result-review', decision, targetHash, approvedBy, this.clock().toISOString(), { note })
    if (!canReviewResult({ gate: 'result-review', decision, targetHash, expectedTargetHash: targetHash, approvedBy })) throw new Error('Result review decision is invalid')
    await assertDecisionBinding(this.runtimeRoot, envelope)
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision: envelope })
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.result-reviewed', { decision: envelope, aggregateRef: run.aggregateResultRef, aggregateHash: hashJson(aggregate) })
    return envelope
  }

  async reviewNode(runId: string, nodeId: string, approvedBy: string, decision: 'continue' | 'stop' = 'continue', note?: string): Promise<OwnerDecisionEnvelope> {
    const claim = await claimRun(this.runtimeRoot, runId, `owner-node-review-${process.pid}`)
    try {
      const run = await readRun(this.runtimeRoot, runId)
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
      const run = await readRun(this.runtimeRoot, runId)
      if (!run.aggregateResultRef) throw new Error('Completion requires a proposed aggregate')
      const aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
      if (aggregate.openQuestions.length > 0) throw new Error('Completion requires all blocking questions to be resolved')
      const targetHash = resultReviewTargetHash(runId, run.aggregateResultRef, aggregate)
      assertAggregateBelongsToRun(runId, aggregate)
      const events = await readRunEvents(this.runtimeRoot, runId)
      const reviewed = events.some((event) => event.type === 'frontdoor.result-reviewed'
        && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.decision === 'accept'
        && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.targetHash === targetHash)
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
}
