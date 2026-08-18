import path from 'node:path'
import type { ApprovedTaskPacket, JobContext } from '../../shared/jobLoopTypes'
import type { DecompositionNode, DecompositionPlanInput, FrontdoorRequestInput, FrontdoorPrepareResult, OwnerDecisionEnvelope } from '../../shared/frontdoorTypes'
import type { ImplementationSourceBinding } from '../../shared/implementationTypes'
import { hashJson } from '../jobLoop/hash'
import { validateApprovedTask } from '../jobLoop/contracts'
import { buildExplicitAdapterPlan, getAdapterProfile } from '../jobLoop/adapterRegistry'
import { ensureDir, readJson, writeJsonExclusive } from '../jobLoop/ledger'
import type { AdapterResultEnvelope } from '../jobLoop/resultEnvelope'
import { prepareFrontdoorRunOrThrow } from './frontdoorPrepareService'
import { readRunEvents } from './ledger'
import { assertImplementationSourceArtifacts } from './implementationBinding'
import type { FrontdoorOrchestrator } from './orchestrator'
import { resultReviewTargetHash } from './ownerGates'
import { assertRuntimeRootSafe, safeRuntimePath } from './pathIntegrity'

export const implementationAdapterId = 'fake-implementation'

function childTaskId(requestId: string, nodeId: string): string {
  return `${requestId}::${nodeId}`
}

function bindingBody(binding: Omit<ImplementationSourceBinding, 'bindingHash'>): Omit<ImplementationSourceBinding, 'bindingHash'> {
  return binding
}

function latestAcceptedParentDecision(inspection: Awaited<ReturnType<FrontdoorOrchestrator['inspectRun']>>, events: Awaited<ReturnType<typeof readRunEvents>>, now: Date): { aggregateRef: string; aggregateHash: string; decision: OwnerDecisionEnvelope } {
  if (!inspection.aggregate || !inspection.run.aggregateResultRef) throw new Error('Implementation child requires a proposed parent aggregate')
  const targetHash = resultReviewTargetHash(inspection.run.runId, inspection.run.aggregateResultRef, inspection.aggregate)
  const reviewed = [...events].reverse().find((event) => event.type === 'frontdoor.result-reviewed'
    && event.payload.aggregateRef === inspection.run.aggregateResultRef
    && event.payload.aggregateHash === hashJson(inspection.aggregate)
    && (event.payload.decision as OwnerDecisionEnvelope | undefined)?.targetHash === targetHash)
  const decision = reviewed?.payload.decision as OwnerDecisionEnvelope | undefined
  const recorded = decision && events.some((event) => {
    if (event.type !== 'frontdoor.owner-decision-recorded') return false
    const stored = event.payload.decision as OwnerDecisionEnvelope | undefined
    return stored?.decisionId === decision.decisionId && hashJson(stored) === hashJson(decision)
  })
  if (!reviewed || !decision || !recorded || decision.decision !== 'accept') throw new Error('Implementation child requires the latest accepted parent Result Review')
  if (!decision.expiresAt || !Number.isFinite(Date.parse(decision.expiresAt)) || Date.parse(decision.expiresAt) <= now.getTime()) throw new Error('Parent Result Review decision is expired')
  return { aggregateRef: inspection.run.aggregateResultRef, aggregateHash: hashJson(inspection.aggregate), decision }
}

async function sourceBinding(orchestrator: FrontdoorOrchestrator, parentRunId: string, sourceNodeId: string, allowedFiles: readonly string[]): Promise<ImplementationSourceBinding> {
  const inspection = await orchestrator.inspectRun(parentRunId)
  const parentEvents = await readRunEvents(orchestrator.runtimeRoot, parentRunId)
  const aggregateBinding = latestAcceptedParentDecision(inspection, parentEvents, orchestrator.clock())
  const record = inspection.run.nodes.find((candidate) => candidate.node.nodeId === sourceNodeId)
  if (!record?.childJobId || !record.threadId || !record.resultRef || !record.resultHash || !record.childInputHash || record.resultStatus !== 'success' && record.resultStatus !== 'partial') throw new Error('Implementation child source Node has no accepted Result binding')
  const aggregateNode = inspection.aggregate?.childResults.find((candidate) => candidate.nodeId === sourceNodeId)
  if (!aggregateNode || aggregateNode.resultRef !== record.resultRef || aggregateNode.status !== record.resultStatus) throw new Error('Implementation child source Node is not bound to the accepted parent Aggregate')
  if (!allowedFiles.length || allowedFiles.some((file) => !inspection.request.scope.inScope.includes(file))) throw new Error('Implementation child file set exceeds the parent Scope')
  const resultPath = await safeRuntimePath(orchestrator.runtimeRoot, record.resultRef)
  const result = await readJson<AdapterResultEnvelope>(resultPath)
  if (hashJson(result) !== record.resultHash || result.taskId !== record.childTaskId || result.jobId !== record.childJobId || result.inputHash !== record.childInputHash || result.orchestrationRunId !== parentRunId) throw new Error('Implementation child source Result binding mismatch')
  const thread = await orchestrator.relay.getConversationState(record.threadId)
  if (thread.threadId !== record.threadId || thread.taskId !== record.childTaskId || thread.jobId !== record.childJobId || thread.inputHash !== record.childInputHash || !thread.turns.some((turn) => turn.resultEnvelopeRef === record.resultRef && turn.orchestrationRunId === parentRunId && turn.resultEnvelopeHash === record.resultHash)) throw new Error('Implementation child source Thread binding mismatch')
  const evidenceRef = `threads/${record.threadId}/evidence-links.json`
  const evidence = await readJson<Record<string, unknown> & { turns?: Array<Record<string, unknown>> }>(await safeRuntimePath(orchestrator.runtimeRoot, evidenceRef))
  if (evidence.threadId !== record.threadId || evidence.taskId !== record.childTaskId || evidence.jobId !== record.childJobId || !evidence.turns?.some((turn) => turn.resultEnvelopeRef === record.resultRef)) throw new Error('Implementation child source Evidence binding mismatch')
  const evidenceHash = hashJson(evidence)
  const contextBundleHash = hashJson({ references: inspection.request.contextReferences, allowedFiles: [...allowedFiles].sort(), sourceResultHash: record.resultHash })
  const capabilityGrantHash = hashJson({ capabilities: ['read', 'propose'], dataPolicy: 'local-only', allowedFiles: [...allowedFiles].sort() })
  const body = bindingBody({
    parentRunId,
    parentRequestId: inspection.request.requestId,
    parentRequestHash: inspection.run.requestHash,
    parentPlanHash: inspection.run.planHash,
    sourceNodeId,
    sourceAggregateRef: aggregateBinding.aggregateRef,
    sourceAggregateHash: aggregateBinding.aggregateHash,
    parentReviewDecisionId: aggregateBinding.decision.decisionId,
    parentReviewTargetHash: aggregateBinding.decision.targetHash,
    parentReviewExpiresAt: aggregateBinding.decision.expiresAt!,
    sourceTaskId: record.childTaskId,
    sourceJobId: record.childJobId,
    sourceThreadId: record.threadId,
    sourceResultRef: record.resultRef,
    sourceResultHash: record.resultHash,
    sourceEvidenceRef: evidenceRef,
    sourceEvidenceHash: evidenceHash,
    contextBundleHash,
    capabilityGrantHash
  })
  return { ...body, bindingHash: hashJson(body) }
}

async function assertParentBindingCurrent(orchestrator: FrontdoorOrchestrator, binding: ImplementationSourceBinding): Promise<void> {
  const parent = await orchestrator.inspectRun(binding.parentRunId)
  const events = await readRunEvents(orchestrator.runtimeRoot, binding.parentRunId)
  const current = latestAcceptedParentDecision(parent, events, orchestrator.clock())
  if (current.aggregateRef !== binding.sourceAggregateRef
    || current.aggregateHash !== binding.sourceAggregateHash
    || current.decision.decisionId !== binding.parentReviewDecisionId
    || current.decision.targetHash !== binding.parentReviewTargetHash
    || current.decision.expiresAt !== binding.parentReviewExpiresAt) throw new Error('Parent Result Review binding changed after child preparation')
}

export interface PrepareImplementationRunInput {
  parentRunId: string
  sourceNodeId: string
  allowedFiles: string[]
  objective?: string
}

export async function prepareImplementationRun(orchestrator: FrontdoorOrchestrator, input: PrepareImplementationRunInput): Promise<FrontdoorPrepareResult & { binding: ImplementationSourceBinding }> {
  const binding = await sourceBinding(orchestrator, input.parentRunId, input.sourceNodeId, input.allowedFiles)
  const parent = await orchestrator.inspectRun(input.parentRunId)
  const requestId = `implementation-${hashJson([input.parentRunId, input.sourceNodeId, binding.sourceResultHash, input.allowedFiles.slice().sort()]).slice(0, 20)}`
  const objective = input.objective?.trim() || `Accepted Resultから候補ファイルを作成する: ${input.sourceNodeId}`
  const contextReferences = [...parent.request.contextReferences]
  const scope = { inScope: [...input.allowedFiles], outOfScope: [...new Set([...parent.request.scope.outOfScope, 'canonical-write', 'external-send', 'commit', 'push', 'merge'])] }
  const request: FrontdoorRequestInput = {
    requestId,
    source: 'owner',
    objective,
    userInput: `Parent Run ${input.parentRunId} の ${input.sourceNodeId} Resultからcandidate-file-setを提案する`,
    projectRef: parent.request.projectRef,
    constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
    requestedOutput: 'candidate-file-set',
    contextReferences,
    scope,
    runKind: 'implementation',
    implementationBinding: binding
  }
  const node: DecompositionNode = {
    nodeId: 'implementation',
    objective,
    role: 'implementation',
    adapterId: implementationAdapterId,
    scope,
    contextReferences,
    acceptance: ['candidate-file-setの本文hashと候補全体hashが一致する'],
    stopConditions: ['Scope外path', 'Capability逸脱', 'Canonical書込み', '外部送信'],
    capabilities: ['read', 'propose'],
    dependsOn: [],
    depth: 1
  }
  const plan: DecompositionPlanInput = { planId: `${requestId}-plan`, requestId, version: 1, nodes: [node], aggregationPolicy: 'stop-on-blocking-question' }
  const prepared = await prepareFrontdoorRunOrThrow(orchestrator, { request, plan })
  return { ...prepared, binding }
}

export async function buildImplementationPacket(orchestrator: FrontdoorOrchestrator, runId: string, approvedBy: string): Promise<ApprovedTaskPacket> {
  const inspection = await orchestrator.inspectRun(runId)
  if (inspection.run.runKind !== 'implementation' || !inspection.run.implementationBinding) throw new Error('run is not an Implementation Run')
  await assertParentBindingCurrent(orchestrator, inspection.run.implementationBinding)
  await assertImplementationSourceArtifacts(orchestrator.runtimeRoot, inspection.run.implementationBinding)
  if (inspection.plan.nodes.length !== 1) throw new Error('Implementation Run must contain exactly one Node')
  const node = inspection.plan.nodes[0]
  const profile = getAdapterProfile(node.adapterId)
  if (profile.dataPolicy !== 'local-only' || !profile.capabilities.includes('propose')) throw new Error('Implementation Adapter is outside the propose/local-only boundary')
  const taskId = childTaskId(inspection.request.requestId, node.nodeId)
  const adapterPlan = buildExplicitAdapterPlan(taskId, node.adapterId, node.role, node.capabilities)
  const context: JobContext = { githubTask: inspection.request.contextReferences[0] ?? `fixture://${inspection.request.requestId}`, obsidianContext: inspection.request.contextReferences.slice(1), adoptedPrinciples: ['owner-gate', 'propose-only', 'local-only'] }
  const scopeHash = hashJson(node.scope)
  const contextHash = hashJson(context)
  const now = orchestrator.clock().toISOString()
  const packet: ApprovedTaskPacket = {
    taskId,
    objective: node.objective,
    scope: node.scope,
    scopeHash,
    context,
    contextHash,
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: { approvalId: `approval-${hashJson([runId, node.nodeId, approvedBy]).slice(0, 20)}`, taskId, status: 'active', approvedBy, approvedAt: now, expiresAt: new Date(Date.parse(now) + 60 * 60 * 1000).toISOString(), scopeHash, routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: node.adapterId,
    fixtureMode: 'success',
    target: { repository: 'runtime-work-plane-only', branch: 'none', worktree: `frontdoor-runs/${runId}`, allowedFiles: [...node.scope.inScope], forbiddenChanges: ['canonical-repo', 'obsidian', 'commit', 'push', 'merge', 'external-send'] },
    adapterPlan,
    frontdoorBinding: { runId, requestHash: inspection.run.requestHash, planHash: inspection.run.planHash, nodeId: node.nodeId },
    implementationBinding: inspection.run.implementationBinding
  }
  validateApprovedTask(packet)
  await assertRuntimeRootSafe(orchestrator.runtimeRoot)
  const runtimeRoot = await assertRuntimeRootSafe(orchestrator.runtimeRoot)
  const packetPath = path.join(runtimeRoot, 'approved-tasks', `${taskId}.json`)
  await ensureDir(path.dirname(packetPath))
  await writeJsonExclusive(packetPath, packet)
  return packet
}
