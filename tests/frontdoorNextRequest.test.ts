import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeImplementationConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { buildImplementationPacket, prepareImplementationRun } from '../src/main/frontdoor/implementationRun'
import { prepareNextRequestFromAcceptedCandidate } from '../src/main/frontdoor/candidateRequest'
import { readRunEvents } from '../src/main/frontdoor/ledger'

const scope = { inScope: ['next-request'], outOfScope: ['canonical-write', 'external-send', 'commit', 'push', 'merge'] }
const parentRequest: FrontdoorRequestInput = {
  requestId: 'candidate-next-parent-001',
  source: 'test',
  objective: '親Resultを作る',
  userInput: '採用Candidateから次Requestを作る',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: '親Result',
  contextReferences: ['fixture://goal.md'],
  scope
}
const parentNode: DecompositionNode = {
  nodeId: 'proposal', objective: '親Resultを提案する', role: 'proposal', adapterId: 'fake-ai-a', scope,
  contextReferences: ['fixture://goal.md'], acceptance: ['Result'], stopConditions: ['Scope外'], capabilities: ['read', 'propose'], dependsOn: [], depth: 1
}

function packet(run: { runId: string; requestHash: string; planHash: string }): ApprovedTaskPacket {
  const taskId = `${parentRequest.requestId}::proposal`
  const adapterPlan = buildExplicitAdapterPlan(taskId, 'fake-ai-a', 'proposal', ['read', 'propose'])
  const context = { githubTask: 'fixture://goal.md', obsidianContext: [], adoptedPrinciples: ['owner-gate'] }
  return {
    taskId, objective: parentNode.objective, scope: parentNode.scope, scopeHash: hashJson(parentNode.scope), context, contextHash: hashJson(context), acceptance: parentNode.acceptance, stopConditions: parentNode.stopConditions,
    approval: { approvalId: 'approval-candidate-next-parent-001', taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-15T00:00:00.000Z', expiresAt: '2099-12-31T23:59:59.000Z', scopeHash: hashJson(parentNode.scope), routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'fake-ai-a', fixtureMode: 'success', target: { repository: 'fixture://adf', branch: 'fixture', worktree: 'runtime-only', allowedFiles: scope.inScope, forbiddenChanges: scope.outOfScope }, adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: parentNode.nodeId }
  }
}

async function createAcceptedCandidate(): Promise<{ orchestrator: FrontdoorOrchestrator; candidateId: string }> {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-next-request-'))
  const orchestrator = new FrontdoorOrchestrator({ relay: new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter(), new FakeImplementationConversationAdapter()] }) })
  const parent = await orchestrator.createRun(parentRequest, { planId: 'candidate-next-parent-plan-001', requestId: parentRequest.requestId, version: 1, nodes: [parentNode], aggregationPolicy: 'collect-all' })
  await orchestrator.approveIntake(parent.runId); await orchestrator.approveCompletionShape(parent.runId); await orchestrator.approveDecomposition(parent.runId)
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${parentRequest.requestId}::proposal.json`), `${JSON.stringify(packet(parent))}\n`)
  await orchestrator.approveDispatch(parent.runId, ['proposal']); await orchestrator.executeApprovedRun(parent.runId, { proposal: packet(parent) }); await orchestrator.reviewResult(parent.runId, 'Project Owner', 'accept')

  const child = await prepareImplementationRun(orchestrator, { parentRunId: parent.runId, sourceNodeId: 'proposal', allowedFiles: ['next-request'] })
  await orchestrator.approveIntake(child.run.runId); await orchestrator.approveCompletionShape(child.run.runId); await orchestrator.approveDecomposition(child.run.runId)
  const childPacket = await buildImplementationPacket(orchestrator, child.run.runId, 'Project Owner')
  await orchestrator.approveDispatch(child.run.runId, ['implementation']); await orchestrator.executeApprovedRun(child.run.runId, { implementation: childPacket }); await orchestrator.reviewResult(child.run.runId, 'Project Owner', 'accept'); await orchestrator.completeRun(child.run.runId, 'Project Owner'); await orchestrator.exportWorkPlaneArtifact(child.run.runId, 'Project Owner')
  const candidates = await orchestrator.listReviewableCandidates()
  const candidateId = candidates[0]?.candidateId
  if (!candidateId) throw new Error('candidate artifact was not exported')
  const inspection = await orchestrator.inspectCandidate(candidateId)
  await orchestrator.reviewCandidate({ candidateId, approvedBy: 'Project Owner', decision: 'accept', targetHash: inspection.targetHash })
  return { orchestrator, candidateId }
}

const nextRequest: Omit<FrontdoorRequestInput, 'sourceCandidateBinding'> = {
  requestId: 'candidate-next-request-001', source: 'owner', objective: '採用Candidateを根拠に次Requestを準備する', userInput: '窓口AIが採用Candidateを解釈し、次のRequestと完了条件を明示した', projectRef: 'fixture://adf', constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false }, requestedOutput: '次Requestの準備結果', contextReferences: ['fixture://goal.md'], scope
}
const nextNode: DecompositionNode = { nodeId: 'proposal', objective: nextRequest.objective, role: 'proposal', adapterId: 'fake-ai-a', scope, contextReferences: ['fixture://goal.md'], acceptance: ['次Requestの準備結果を返す'], stopConditions: ['Scope外'], capabilities: ['read', 'propose'], dependsOn: [], depth: 1 }

describe('ADF accepted Candidate to next Request', () => {
  it('creates an Intake-gated Request with replayable Candidate provenance and is idempotent', async () => {
    const { orchestrator, candidateId } = await createAcceptedCandidate()
    const plan = { planId: 'candidate-next-request-plan-001', requestId: nextRequest.requestId, version: 1, nodes: [nextNode], aggregationPolicy: 'stop-on-blocking-question' as const }
    const prepared = await prepareNextRequestFromAcceptedCandidate(orchestrator, { candidateId, request: nextRequest, plan })
    expect(prepared.reused).toBe(false)
    expect(prepared.run.ownerGate).toBe('awaiting-owner:intake')
    const inspection = await orchestrator.inspectRun(prepared.run.runId)
    expect(inspection.request.sourceCandidateBinding).toMatchObject({ candidateId, candidateHash: prepared.sourceCandidateBinding.candidateHash, reviewDecisionId: prepared.sourceCandidateBinding.reviewDecisionId })
    const events = await readRunEvents(orchestrator.runtimeRoot, prepared.run.runId)
    expect(events.some((event) => event.type === 'frontdoor.candidate-request-created' && event.payload.candidateId === candidateId && event.payload.requestHash === prepared.run.requestHash)).toBe(true)
    const reused = await prepareNextRequestFromAcceptedCandidate(orchestrator, { candidateId, request: nextRequest, plan })
    expect(reused.reused).toBe(true)
    await expect(prepareNextRequestFromAcceptedCandidate(orchestrator, { candidateId, request: { ...nextRequest, objective: '別の意味に変更' }, plan })).rejects.toThrow(/different Request content/)
    await expect(prepareNextRequestFromAcceptedCandidate(orchestrator, { candidateId, request: { ...nextRequest, requestId: 'candidate-next-request-002' }, plan: { ...plan, requestId: 'candidate-next-request-002', planId: 'candidate-next-request-plan-002' } })).rejects.toThrow(/already bound to another Request/)
  })
})
