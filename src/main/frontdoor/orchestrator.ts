import path from 'node:path'
import type { ApprovedTaskPacket } from '../../shared/jobLoopTypes'
import type { AggregateResult, DecompositionNode, DecompositionPlan, FrontdoorInspection, FrontdoorLedgerEvent, FrontdoorNodeReview, FrontdoorQuestion, FrontdoorRequest, FrontdoorReturn, OrchestrationNodeRecord, OrchestrationRun } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'
import { validateApprovedTask } from '../jobLoop/contracts'
import type { ConversationRelay } from '../jobLoop/relay'
import type { AdapterDependencyResult } from '../jobLoop/conversationAdapters'
import { createDecompositionPlan, readyNodeIds, validateDecompositionPlan } from './decomposition'
import { createFrontdoorRequest } from './intake'
import { aggregateResults, buildFrontdoorReturn } from './returnEnvelope'
import { questionsFromThread } from './questionAggregator'
import { assertBundleReady, claimRun, readPlan, readRequest, readRun, readRunClaim, readRunEvents, recordRunEvent, releaseRun, replayRunFromEvents, writeAggregate, writeRun, writeRunBundleExclusive } from './ledger'
import { replayFrontdoorRun } from './eventLedger'
import { readJson } from '../jobLoop/ledger'
import type { AdapterResultEnvelope } from '../jobLoop/resultEnvelope'
import { assertDispatchApproved, buildDecisionEnvelope, FrontdoorOwnerGateService, nodeReviewTargetHash, nodeTargetHash } from './ownerGates'
import { getAdapterProfile } from '../jobLoop/adapterRegistry'
import { buildActivityTrace } from './activityTrace'

export interface FrontdoorOrchestratorOptions {
  relay: ConversationRelay
  clock?: () => Date
}

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

function packetContextReferences(packet: ApprovedTaskPacket): string[] {
  return [packet.context.githubTask, ...packet.context.obsidianContext]
}

async function assertRunIntegrity(runtimeRoot: string, run: OrchestrationRun, request: FrontdoorRequest, plan: DecompositionPlan, verifyBundle = true): Promise<void> {
  if (verifyBundle) await assertBundleReady(runtimeRoot, run.runId)
  if (requestHash(request) !== run.requestHash || request.inputHash !== run.requestHash) throw new Error('Frontdoor request hash integrity check failed')
  if (planHash(plan) !== run.planHash || plan.planHash !== run.planHash) throw new Error('Frontdoor plan hash integrity check failed')
  const expectedRunId = `run-${hashJson([request.requestId, request.inputHash, plan.planHash]).slice(0, 20)}`
  if (run.runId !== expectedRunId) throw new Error('Frontdoor run binding hash integrity check failed')
  if (run.requestId !== request.requestId) throw new Error('Frontdoor run request binding mismatch')
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

function runProjection(run: OrchestrationRun): unknown {
  return { runId: run.runId, requestId: run.requestId, requestHash: run.requestHash, planHash: run.planHash, state: run.state, ownerGate: run.ownerGate, nodes: run.nodes, approvalIds: run.approvalIds, openQuestionIds: run.openQuestionIds, aggregateResultRef: run.aggregateResultRef, nodeReview: run.nodeReview }
}

function assertRunEventConsistency(run: OrchestrationRun, events: readonly FrontdoorLedgerEvent[]): void {
  if (events.length === 0) throw new Error('Frontdoor run has no ledger events')
  const replayed = replayFrontdoorRun(events)
  if (hashJson(runProjection(replayed)) !== hashJson(runProjection(run))) throw new Error('Frontdoor event replay does not match run.json')
  const lastResume = Math.max(-1, ...events.filter((event) => event.type === 'frontdoor.question-answered' || event.type === 'frontdoor.node-review-continued').map((event) => event.sequence))
  const progressed = events.some((event) => event.sequence > lastResume && ['frontdoor.approval-bound', 'frontdoor.node-started', 'frontdoor.node-completed', 'frontdoor.node-failed', 'frontdoor.run-completed', 'frontdoor.run-stopped'].includes(event.type))
  if (run.state === 'ready-for-approval' && progressed) throw new Error('Frontdoor ready state conflicts with persisted execution events')
  if (['complete', 'partial', 'failed', 'blocked-by-question', 'cancelled'].includes(run.state) && !events.some((event) => event.type === 'frontdoor.run-completed' || event.type === 'frontdoor.run-stopped')) throw new Error('Frontdoor terminal state has no terminal ledger event')
}

function changedNodeRecords(before: OrchestrationRun, after: OrchestrationRun): OrchestrationNodeRecord[] {
  return after.nodes.filter((record) => {
    const previous = before.nodes.find((candidate) => candidate.node.nodeId === record.node.nodeId)
    return !previous || hashJson(previous) !== hashJson(record)
  })
}

function assertPacketMatchesNode(request: FrontdoorRequest, run: OrchestrationRun, node: OrchestrationNodeRecord, packet: ApprovedTaskPacket): void {
  validateApprovedTask(packet)
  const errors: string[] = []
  if (packet.taskId !== node.childTaskId) errors.push(`packet taskId mismatch for ${node.node.nodeId}`)
  if (packet.objective !== node.node.objective) errors.push(`packet objective mismatch for ${node.node.nodeId}`)
  if (hashJson(packet.scope) !== hashJson(node.node.scope)) errors.push(`packet scope mismatch for ${node.node.nodeId}`)
  const packetReferences = packetContextReferences(packet)
  if (!node.node.contextReferences.every((reference) => packetReferences.includes(reference))) errors.push(`packet context mismatch for ${node.node.nodeId}`)
  if (!packetReferences.every((reference) => request.contextReferences.includes(reference))) errors.push(`packet context exceeds parent request for ${node.node.nodeId}`)
  if (hashJson(packet.context) !== packet.contextHash) errors.push(`packet context hash mismatch for ${node.node.nodeId}`)
  if (!packet.frontdoorBinding || packet.frontdoorBinding.runId !== run.runId || packet.frontdoorBinding.requestHash !== run.requestHash || packet.frontdoorBinding.planHash !== run.planHash || packet.frontdoorBinding.nodeId !== node.node.nodeId) errors.push(`packet Frontdoor binding is missing or mismatched for ${node.node.nodeId}`)
  if (packet.adapterPlan.selections.length !== 1) errors.push(`node packet must contain one adapter selection: ${node.node.nodeId}`)
  const selection = packet.adapterPlan.selections[0]
  if (!selection || selection.adapterId !== node.node.adapterId || selection.role !== node.node.role) errors.push(`packet adapter plan mismatch for ${node.node.nodeId}`)
  if (!node.node.capabilities.every((capability) => packet.approval.capabilities.includes(capability))) errors.push(`packet capability mismatch for ${node.node.nodeId}`)
  if (packet.taskId.startsWith(`${request.requestId}::`) === false) errors.push(`packet task is not a child of the Frontdoor request: ${node.node.nodeId}`)
  if (errors.length) throw new Error(`Approved child packet rejected: ${errors.join('; ')}`)
}

export class FrontdoorOrchestrator {
  readonly relay: ConversationRelay
  readonly runtimeRoot: string
  readonly clock: () => Date
  readonly ownerGates: FrontdoorOwnerGateService

  constructor({ relay, clock = () => new Date() }: FrontdoorOrchestratorOptions) {
    this.relay = relay
    this.runtimeRoot = relay.runtimeRoot
    this.clock = clock
    this.ownerGates = new FrontdoorOwnerGateService({ runtimeRoot: this.runtimeRoot, clock })
  }

  async approveDispatch(runId: string, nodeIds: readonly string[], approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.approveDispatch(runId, nodeIds, approvedBy, note)
  }

  async approveIntake(runId: string, approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.approveIntake(runId, approvedBy, note)
  }

  async approveCompletionShape(runId: string, approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.approveCompletionShape(runId, approvedBy, note)
  }

  async approveDecomposition(runId: string, approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.approveDecomposition(runId, approvedBy, note)
  }

  async answerQuestion(runId: string, question: import('../../shared/frontdoorTypes').FrontdoorQuestion, approvedBy = 'Project Owner', answerRef?: string, note?: string) {
    return this.ownerGates.answerQuestion(runId, question, approvedBy, answerRef, note)
  }

  async reviewResult(runId: string, approvedBy = 'Project Owner', decision: 'accept' | 'follow-up' | 'reject' = 'accept', note?: string) {
    return this.ownerGates.reviewResult(runId, approvedBy, decision, note)
  }

  async reviewNode(runId: string, nodeId: string, approvedBy = 'Project Owner', decision: 'continue' | 'stop' = 'continue', note?: string) {
    return this.ownerGates.reviewNode(runId, nodeId, approvedBy, decision, note)
  }

  async completeRun(runId: string, approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.completeRun(runId, approvedBy, note)
  }

  async exportWorkPlaneArtifact(runId: string, approvedBy = 'Project Owner', note?: string) {
    return this.ownerGates.exportWorkPlaneArtifact(runId, approvedBy, note)
  }

  async createRun(requestInput: Parameters<typeof createFrontdoorRequest>[0], planInput: Parameters<typeof createDecompositionPlan>[1]): Promise<OrchestrationRun> {
    const request = createFrontdoorRequest(requestInput, this.clock().toISOString())
    const plan = createDecompositionPlan(request, planInput)
    const now = this.clock().toISOString()
    const runId = `run-${hashJson([request.requestId, request.inputHash, plan.planHash]).slice(0, 20)}`
    const nodes: OrchestrationNodeRecord[] = plan.nodes.map((node) => ({ node, state: 'queued', childTaskId: childTaskId(request.requestId, node.nodeId), questionIds: [], attempt: 0 }))
    const run: OrchestrationRun = { runId, requestId: request.requestId, requestHash: request.inputHash, planHash: plan.planHash, state: 'ready-for-approval', nodes, approvalIds: [], openQuestionIds: [], createdAt: now, updatedAt: now, ownerGate: 'awaiting-owner:intake' }
    try {
      await writeRunBundleExclusive(this.runtimeRoot, request, plan, run)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const existing = await readRun(this.runtimeRoot, runId)
      const existingRequest = await readRequest(this.runtimeRoot, runId)
      const existingPlan = await readPlan(this.runtimeRoot, runId)
      await assertRunIntegrity(this.runtimeRoot, existing, existingRequest, existingPlan)
      assertRunEventConsistency(existing, await readRunEvents(this.runtimeRoot, runId))
      if (existing.requestHash !== request.inputHash || existing.planHash !== plan.planHash) throw new Error('Frontdoor run collision has incompatible hashes')
      return existing
    }
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.run-created', { requestId: request.requestId, planHash: plan.planHash, nodeIds: plan.nodes.map((node) => node.nodeId), snapshot: run })
    await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-gate-opened', { gate: 'intake', targetHash: request.inputHash })
    return run
  }

  async executeApprovedRun(runId: string, packets: Readonly<Record<string, ApprovedTaskPacket>>, options: { requirePacketBinding?: boolean } = {}): Promise<FrontdoorReturn> {
    const claim = await claimRun(this.runtimeRoot, runId, `orchestrator-${process.pid}`)
    try {
      let run = await readRun(this.runtimeRoot, runId)
      if (run.state !== 'ready-for-approval') throw new Error(`Frontdoor run is not ready for approval: ${run.state}`)
      const request = await readRequest(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
      await assertRunIntegrity(this.runtimeRoot, run, request, plan)
      assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId))
      const packetIds = Object.keys(packets).sort()
      const nodeIds = run.nodes.map((record) => record.node.nodeId).sort()
      if (packetIds.join('|') !== nodeIds.join('|')) throw new Error('approved child packet set does not exactly match the DecompositionPlan')
      const packetHashes = Object.fromEntries(run.nodes.map((record) => [record.node.nodeId, hashJson(packets[record.node.nodeId])]))
      const requiresPacketBinding = options.requirePacketBinding === true || run.nodes.some((record) => getAdapterProfile(record.node.adapterId).connection === 'local-http')
      await assertDispatchApproved(this.runtimeRoot, runId, nodeIds, packetHashes, requiresPacketBinding)
      for (const node of run.nodes) {
        const packet = packets[node.node.nodeId]
        if (packet.frontdoorBinding?.requestHash !== run.requestHash || packet.frontdoorBinding?.planHash !== run.planHash || packet.frontdoorBinding?.runId !== run.runId) throw new Error(`packet Frontdoor binding mismatch for ${node.node.nodeId}`)
        assertPacketMatchesNode(request, run, node, packet)
      }
      const questions = [] as import('../../shared/frontdoorTypes').FrontdoorQuestion[]
      const evidenceRefs: string[] = []
      let executedNodeId: string | undefined
      execution: {
      if (run.nodes.some((node) => node.state === 'queued')) {
        const ready = readyNodeIds(run.nodes)
        if (ready.length === 0) {
          run = { ...run, nodes: run.nodes.map((node) => node.state === 'queued' ? { ...node, state: 'cancelled', error: 'dependency failed or was cancelled' } : node), updatedAt: this.clock().toISOString() }
          await writeRun(this.runtimeRoot, run)
          await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-failed', { nodeId: 'dependency-resolution', nodeRecords: run.nodes, runState: run.state, error: 'dependency failed or was cancelled' })
          break execution
        }
        const nodeId = ready[0]
        executedNodeId = nodeId
        const record = run.nodes.find((node) => node.node.nodeId === nodeId)!
        const dependencyResults: AdapterDependencyResult[] = []
        for (const dependencyId of record.node.dependsOn) {
          const dependency = run.nodes.find((node) => node.node.nodeId === dependencyId)
          if (!dependency?.resultRef || !dependency.resultStatus || !dependency.resultHash) throw new Error(`dependency result is not proven for ${dependencyId}`)
          const envelope = await readJson<AdapterResultEnvelope>(path.join(this.runtimeRoot, dependency.resultRef))
          if (!dependency.resultRef.startsWith('threads/') || dependency.resultRef.includes('..') || hashJson(envelope) !== dependency.resultHash) throw new Error(`dependency result provenance mismatch for ${dependencyId}`)
          if (envelope.taskId !== dependency.childTaskId || envelope.jobId !== dependency.childJobId || envelope.inputHash !== dependency.childInputHash || envelope.orchestrationRunId !== runId) throw new Error(`dependency result identity mismatch for ${dependencyId}`)
          dependencyResults.push({ runId, nodeId: dependencyId, resultRef: dependency.resultRef, resultHash: dependency.resultHash, status: dependency.resultStatus, ...(envelope.content ? { content: envelope.content.slice(0, 1000) } : {}) })
        }
        try {
          // Readiness is checked immediately before this Node can create a Job/Thread. A
          // Proposal may succeed while the local provider becomes unavailable before its
          // dependent Critic. The first-node failure remains fail-closed before Run mutation;
          // a later-node failure is recorded as a failed Node without opening a send.
          await this.relay.assertAdapterReadyForDispatch(record.node.adapterId)
        } catch (error) {
          const hasCompletedNode = run.nodes.some((candidate) => candidate.state === 'completed' || candidate.state === 'awaiting-question')
          if (!hasCompletedNode) throw error
          const message = String((error as Error).message ?? error).slice(0, 200)
          const executionRun = run.state === 'ready-for-approval' ? { ...run, state: 'running' as const, ownerGate: 'running' as const } : run
          const beforeFailure = executionRun
          run = cancelDependents({ ...executionRun, nodes: executionRun.nodes.map((candidate) => candidate.node.nodeId === nodeId ? { ...candidate, state: 'failed' as const, error: message } : candidate), updatedAt: this.clock().toISOString() }, nodeId, 'dependency failed')
          await writeRun(this.runtimeRoot, run)
          await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-failed', { nodeId, error: message, nodeRecords: changedNodeRecords(beforeFailure, run), runState: run.state })
          break execution
        }
        if (run.state === 'ready-for-approval') {
          run = { ...run, state: 'running', ownerGate: 'running', updatedAt: this.clock().toISOString(), approvalIds: run.nodes.map((node) => packets[node.node.nodeId].approval.approvalId) }
          await writeRun(this.runtimeRoot, run)
          await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.approval-bound', { approvalIds: run.approvalIds })
        }
        run = { ...run, nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? { ...node, state: 'running', attempt: node.attempt + 1 } : node), updatedAt: this.clock().toISOString() }
        await writeRun(this.runtimeRoot, run)
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-started', { nodeId, childTaskId: record.childTaskId, attempt: run.nodes.find((node) => node.node.nodeId === nodeId)?.attempt ?? 1 })
        try {
          const thread = await this.relay.startThread(packets[nodeId], { title: record.node.objective, maxTurns: 1 })
          const completed = await this.relay.continueJob(thread.threadId, record.node.adapterId, dependencyResults, runId)
          const turn = completed.turns[completed.turns.length - 1]
          const nodeQuestions = questionsFromThread(runId, record, completed)
          questions.push(...nodeQuestions)
          if (turn?.resultEnvelopeRef) evidenceRefs.push(turn.resultEnvelopeRef)
          const nextState = turn?.status === 'failed' || turn?.status === 'invalid'
            ? 'failed'
            : nodeQuestions.some((question) => question.status === 'open' && question.blocking) && plan.aggregationPolicy === 'stop-on-blocking-question'
              ? 'awaiting-question'
              : 'completed'
          let resultHash: string | undefined
          if (turn?.resultEnvelopeRef) resultHash = hashJson(await readJson<AdapterResultEnvelope>(path.join(this.runtimeRoot, turn.resultEnvelopeRef)))
          const beforeCompletion = run
          run = { ...run, nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? { ...node, state: nextState, childJobId: completed.jobId, threadId: completed.threadId, childInputHash: completed.inputHash, resultStatus: turn?.status, resultRef: turn?.resultEnvelopeRef, resultHash, questionIds: nodeQuestions.map((question) => question.questionId), error: nextState === 'failed' ? turn?.content : undefined } : node), updatedAt: this.clock().toISOString() }
          if (nextState === 'failed') run = cancelDependents(run, nodeId, 'dependency failed')
          if (nextState === 'awaiting-question') run = { ...run, state: 'blocked-by-question', nodes: run.nodes.map((node) => node.state === 'queued' ? { ...node, state: 'cancelled', error: 'blocked by Owner question' } : node) }
          await writeRun(this.runtimeRoot, run)
          await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-completed', { nodeId, threadId: completed.threadId, resultStatus: turn?.status, nodeState: nextState, questionIds: nodeQuestions.map((question) => question.questionId), nodeRecords: changedNodeRecords(beforeCompletion, run), runState: run.state })
        } catch (error) {
          const message = String((error as Error).message ?? error).slice(0, 200)
          const beforeFailure = run
          run = cancelDependents({ ...run, nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? { ...node, state: 'failed', error: message } : node), updatedAt: this.clock().toISOString() }, nodeId, 'dependency failed')
          await writeRun(this.runtimeRoot, run)
          await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-failed', { nodeId, error: message, nodeRecords: changedNodeRecords(beforeFailure, run), runState: run.state })
        }
      }
      }

      const completedNode = executedNodeId ? run.nodes.find((node) => node.node.nodeId === executedNodeId) : undefined
      const nextNodeIds = readyNodeIds(run.nodes)
      if (run.nodes.some((node) => node.state === 'queued') && nextNodeIds.length > 0 && completedNode) {
        const nextReview: FrontdoorNodeReview = {
          nodeId: completedNode.node.nodeId,
          resultRef: completedNode.resultRef,
          resultHash: completedNode.resultHash,
          status: completedNode.resultStatus,
          verification: completedNode.resultRef ? (await readJson<AdapterResultEnvelope>(path.join(this.runtimeRoot, completedNode.resultRef))).verification : [],
          risks: completedNode.resultRef ? (await readJson<AdapterResultEnvelope>(path.join(this.runtimeRoot, completedNode.resultRef))).risks : [],
          nextNodeIds,
          targetHash: nodeReviewTargetHash(run, completedNode.node.nodeId, completedNode.resultHash, nextNodeIds)
        }
        if (completedNode.resultRef) {
          const envelope = await readJson<AdapterResultEnvelope>(path.join(this.runtimeRoot, completedNode.resultRef))
          nextReview.summary = envelope.summary
          nextReview.content = envelope.content?.slice(0, 4000)
        }
        run = { ...run, state: 'awaiting-owner', ownerGate: 'awaiting-owner:node-review', nodeReview: nextReview, updatedAt: this.clock().toISOString() }
        await writeRun(this.runtimeRoot, run)
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.node-review-opened', { nodeId: nextReview.nodeId, nodeReview: nextReview, runState: run.state })
        const interim = aggregateResults(runId, run.nodes, questions, [...new Set([...evidenceRefs, ...run.nodes.flatMap((node) => node.resultRef ? [node.resultRef] : [])])], this.clock().toISOString())
        return {
          ...buildFrontdoorReturn(request, interim),
          status: 'partial',
          summary: `${completedNode.node.nodeId}のResultを記録しました。次のNodeへ進むかOwnerが判断してください。`,
          answer: `${completedNode.node.nodeId}のResultを記録しました。`,
          nextAction: 'OwnerがNode Resultを確認し、継続または停止を判断する'
        }
      }
      const aggregate = aggregateResults(runId, run.nodes, questions, [...new Set([...evidenceRefs, ...run.nodes.flatMap((node) => node.resultRef ? [node.resultRef] : [])])], this.clock().toISOString())
      const aggregateRef = await writeAggregate(this.runtimeRoot, runId, aggregate)
      run = { ...run, state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review', openQuestionIds: aggregate.openQuestions.map((question) => question.questionId), aggregateResultRef: aggregateRef, updatedAt: this.clock().toISOString() }
      await writeRun(this.runtimeRoot, run)
      if (aggregate.openQuestions.length > 0) {
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.question-opened', { questionIds: run.openQuestionIds, runState: run.state })
      } else {
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.completion-proposed', { aggregateRef, aggregateHash: hashJson(aggregate), openQuestionIds: [], runState: run.state })
      }
      return buildFrontdoorReturn(request, aggregate)
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async recoverRun(runId: string): Promise<OrchestrationRun> {
    const existingClaim = await readRunClaim(this.runtimeRoot, runId)
    if (existingClaim) {
      if (existingClaim.hostname !== (process.env.HOSTNAME ?? 'unknown') || !Number.isInteger(existingClaim.pid) || existingClaim.pid <= 0 || !existingClaim.token) throw new Error('Frontdoor run claim cannot be verified safely')
      try {
        process.kill(existingClaim.pid, 0)
        throw new Error('Frontdoor run is still claimed by a live process')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        await releaseRun(this.runtimeRoot, runId, existingClaim.token)
      }
    }
    const claim = await claimRun(this.runtimeRoot, runId, `recovery-${process.pid}`)
    try {
      const request = await readRequest(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
      const events = await readRunEvents(this.runtimeRoot, runId)
      const run = await replayRunFromEvents(this.runtimeRoot, runId)
      await assertRunIntegrity(this.runtimeRoot, run, request, plan, false)
      assertRunEventConsistency(run, events)
      if (events.length === 0) throw new Error('Frontdoor run has no ledger events; refusing recovery')
      const started = new Set(events.filter((event) => event.type === 'frontdoor.node-started').map((event) => String(event.payload.nodeId)))
      const completed = new Set(events.filter((event) => ['frontdoor.node-completed', 'frontdoor.node-failed'].includes(event.type)).map((event) => String(event.payload.nodeId)))
      const interrupted = new Set([...started].filter((nodeId) => !completed.has(nodeId)))
      const recovered = run.state === 'running' || interrupted.size > 0
        ? { ...run, state: 'awaiting-owner' as const, ownerGate: 'awaiting-owner:dispatch' as const, nodes: run.nodes.map((node) => node.state === 'running' || interrupted.has(node.node.nodeId) ? { ...node, state: 'recovery-needed' as const, error: 'process interrupted before node completion' } : node), updatedAt: this.clock().toISOString() }
        : run
      if (recovered !== run) {
        await writeRun(this.runtimeRoot, recovered)
        await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.run-recovery-needed', { nodeIds: recovered.nodes.filter((node) => node.state === 'recovery-needed').map((node) => node.node.nodeId), nodeRecords: recovered.nodes.filter((node) => node.state === 'recovery-needed'), runState: recovered.state })
      }
      return recovered
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async stopRun(runId: string, note = 'Owner stopped Frontdoor run', approvedBy = 'Project Owner'): Promise<OrchestrationRun> {
    const claim = await claimRun(this.runtimeRoot, runId, `stop-${process.pid}`)
    try {
      const run = await readRun(this.runtimeRoot, runId)
      const request = await readRequest(this.runtimeRoot, runId)
      const plan = await readPlan(this.runtimeRoot, runId)
      await assertRunIntegrity(this.runtimeRoot, run, request, plan)
      assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId))
      if (['complete', 'partial', 'failed', 'cancelled'].includes(run.state)) return run
      const gate = run.ownerGate?.startsWith('awaiting-owner:') ? run.ownerGate.slice('awaiting-owner:'.length) as import('../../shared/frontdoorTypes').OwnerGate : 'dispatch'
      const stopTargetHash = hashJson({ runId, requestId: run.requestId, planHash: run.planHash, gate })
      const decision = buildDecisionEnvelope(run, gate, 'stop', stopTargetHash, approvedBy, this.clock().toISOString(), { note })
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.owner-decision-recorded', { decision })
      const stopped = { ...run, state: 'cancelled' as const, ownerGate: 'stopped' as const, nodes: run.nodes.map((node) => ['queued', 'ready', 'running', 'recovery-needed', 'awaiting-question'].includes(node.state) ? { ...node, state: 'cancelled' as const, error: note } : node), updatedAt: this.clock().toISOString() }
      await writeRun(this.runtimeRoot, stopped)
      await recordRunEvent(this.runtimeRoot, runId, 'frontdoor.run-stopped', { note, nodeRecords: stopped.nodes, runState: stopped.state })
      return stopped
    } finally {
      await releaseRun(this.runtimeRoot, runId, claim.token)
    }
  }

  async getRun(runId: string): Promise<OrchestrationRun> {
    const run = await readRun(this.runtimeRoot, runId)
    const request = await readRequest(this.runtimeRoot, runId)
    const plan = await readPlan(this.runtimeRoot, runId)
    await assertRunIntegrity(this.runtimeRoot, run, request, plan)
    assertRunEventConsistency(run, await readRunEvents(this.runtimeRoot, runId))
    return run
  }

  async inspectRun(runId: string): Promise<FrontdoorInspection> {
    const run = await this.getRun(runId)
    const [request, plan, events] = await Promise.all([readRequest(this.runtimeRoot, runId), readPlan(this.runtimeRoot, runId), readRunEvents(this.runtimeRoot, runId)])
    let aggregate: AggregateResult | undefined
    if (run.aggregateResultRef) {
      if (!run.aggregateResultRef.startsWith('frontdoor-runs/') || run.aggregateResultRef.includes('..') || path.isAbsolute(run.aggregateResultRef)) throw new Error('Frontdoor Aggregate reference is outside the Runtime boundary')
      aggregate = await readJson<AggregateResult>(path.join(this.runtimeRoot, run.aggregateResultRef))
      if (aggregate.runId !== runId) throw new Error('Frontdoor Aggregate belongs to another Run')
      const proposed = events.find((event) => event.type === 'frontdoor.completion-proposed' && event.payload.aggregateRef === run.aggregateResultRef)
      if (!proposed || proposed.payload.aggregateHash !== hashJson(aggregate)) throw new Error('Frontdoor Aggregate does not match its proposed Evidence')
    }
    const decisions = events
      .filter((event) => event.type === 'frontdoor.owner-decision-recorded')
      .map((event) => event.payload.decision as import('../../shared/frontdoorTypes').OwnerDecisionEnvelope)
    return {
      run,
      request,
      plan,
      decisions,
      aggregate,
      aggregateHash: aggregate ? hashJson(aggregate) : undefined,
      evidenceRefs: aggregate?.evidenceRefs ?? [],
      openQuestions: aggregate?.openQuestions ?? [],
      nextAction: aggregate?.nextAction ?? (run.ownerGate ?? 'awaiting-owner'),
      eventCount: events.length,
      nodeTargetHashes: Object.fromEntries(run.nodes.map((record) => [record.node.nodeId, nodeTargetHash(run, record)])),
      nodeReview: run.nodeReview,
      activities: buildActivityTrace(events, run)
    }
  }

  async getOpenQuestion(runId: string, questionId: string): Promise<FrontdoorQuestion> {
    const inspection = await this.inspectRun(runId)
    const question = inspection.openQuestions.find((candidate) => candidate.questionId === questionId && candidate.status === 'open')
    if (!question) throw new Error(`current open Question not found: ${questionId}`)
    return question
  }
}

function cancelDependents(run: OrchestrationRun, failedNodeId: string, reason: string): OrchestrationRun {
  const blocked = new Set([failedNodeId])
  let changed = true
  const nodes = run.nodes.map((node) => ({ ...node }))
  while (changed) {
    changed = false
    for (const node of nodes) {
      if (node.state === 'queued' && node.node.dependsOn.some((dependency) => blocked.has(dependency))) {
        node.state = 'cancelled'
        node.error = reason
        blocked.add(node.node.nodeId)
        changed = true
      }
    }
  }
  return { ...run, nodes }
}
