import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { createFrontdoorRequest } from '../src/main/frontdoor/intake'
import { createDecompositionPlan } from '../src/main/frontdoor/decomposition'
import { FrontdoorOwnerGateService, canAnswer, canApprove, canComplete, canDispatch, dispatchTargetHash, questionTargetHash } from '../src/main/frontdoor/ownerGates'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { readFrontdoorEvents } from '../src/main/frontdoor/eventLedger'

const requestInput: FrontdoorRequestInput = {
  requestId: 'owner-gate-request-001',
  source: 'test',
  objective: 'Owner Gateを検証する',
  userInput: '承認前DispatchとResult採用を拒否する',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: '検証結果',
  contextReferences: ['fixture://goal.md'],
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
}

const proposal: DecompositionNode = {
  nodeId: 'proposal',
  objective: 'Owner Gateを検証する',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] },
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Resultを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function packet(run: Pick<OrchestrationRun, 'runId' | 'requestHash' | 'planHash'>): ApprovedTaskPacket {
  const adapterPlan = buildExplicitAdapterPlan(`${requestInput.requestId}::proposal`, 'fake-ai-a', 'proposal', ['read', 'propose'])
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-approval'] }
  return {
    taskId: `${requestInput.requestId}::proposal`,
    objective: proposal.objective,
    scope: proposal.scope,
    scopeHash: hashJson(proposal.scope),
    context,
    contextHash: hashJson(context),
    acceptance: proposal.acceptance,
    stopConditions: proposal.stopConditions,
    approval: { approvalId: 'approval-owner-gate-001', taskId: `${requestInput.requestId}::proposal`, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash: hashJson(proposal.scope), routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://adf', branch: 'fixture/frontdoor', worktree: 'fixture://frontdoor', allowedFiles: ['docs/tasks/fixture.md'], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: proposal.nodeId }
  }
}

async function createFixture(fixture: 'success' | 'partial' = 'success', aggregationPolicy: 'collect-all' | 'stop-on-blocking-question' = 'collect-all') {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-owner-gates-'))
  const relay = new ConversationRelay({ runtimeRoot, adapters: fixture === 'partial' ? [new FakeProposalConversationAdapter('partial')] : undefined })
  const orchestrator = new FrontdoorOrchestrator({ relay })
  const run = await orchestrator.createRun(requestInput, { planId: 'owner-gate-plan-001', requestId: requestInput.requestId, version: 1, nodes: [proposal], aggregationPolicy })
  return { runtimeRoot, orchestrator, run }
}

async function approveInitialGates(orchestrator: FrontdoorOrchestrator, runId: string): Promise<void> {
  await orchestrator.approveIntake(runId)
  await orchestrator.approveCompletionShape(runId)
  await orchestrator.approveDecomposition(runId)
}

describe('Frontdoor Owner Gates', () => {
  it('rejects dispatch when no matching Owner Decision exists', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    await expect(orchestrator.executeApprovedRun(run.runId, { proposal: packet(run) })).rejects.toThrow(/matching Owner Decision/)
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.some((event) => event.type === 'frontdoor.approval-bound')).toBe(false)
    expect(events.some((event) => event.type === 'frontdoor.node-started')).toBe(false)
    await expect(readFile(path.join(runtimeRoot, 'threads'), 'utf8')).rejects.toThrow()
  })

  it('requires result review before completion and records the accepted completion separately', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    await approveInitialGates(orchestrator, run.runId)
    await orchestrator.approveDispatch(run.runId, [proposal.nodeId])
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: packet(run) })
    expect(result.status).toBe('complete')
    await expect(orchestrator.completeRun(run.runId)).rejects.toThrow(/accepted Result review/)
    await orchestrator.reviewResult(run.runId)
    const completed = await orchestrator.completeRun(run.runId)
    expect(completed.state).toBe('complete')
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.some((event) => event.type === 'frontdoor.result-reviewed')).toBe(true)
    expect(events.some((event) => event.type === 'frontdoor.completion-approved')).toBe(true)
  })

  it('rejects stale dispatch targets and requires explicit question content', () => {
    const run = { runId: 'run-1', requestId: 'request-1', planHash: 'plan-hash', state: 'ready-for-approval' as const }
    const targetHash = dispatchTargetHash(run, ['proposal'])
    expect(canApprove({ gate: 'dispatch', decision: 'dispatch', targetHash: 'stale', expectedTargetHash: targetHash, approvedBy: 'Project Owner' })).toBe(false)
    expect(canDispatch(run, ['proposal'], { gate: 'dispatch', decision: 'dispatch', targetHash, approvedBy: 'Project Owner' })).toBe(true)
    const question = { questionId: 'question-1', runId: 'run-1', nodeId: 'proposal', text: '続行しますか？', status: 'open' as const }
    const questionHash = questionTargetHash(question)
    expect(canAnswer(question, { gate: 'question', decision: 'answer', targetHash: questionHash, approvedBy: 'Project Owner' })).toBe(false)
    expect(canAnswer(question, { gate: 'question', decision: 'answer', targetHash: questionHash, approvedBy: 'Project Owner', note: '続行する' })).toBe(true)
    expect(canComplete({ state: 'awaiting-owner' }, { gate: 'completion', decision: 'complete', targetHash, approvedBy: 'Project Owner' }, targetHash, false)).toBe(false)
  })

  it('binds a new Dispatch Decision to the exact child Packet hash and rejects a tampered Packet before send', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    const approvedPacket = packet(run)
    await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
    await writeFile(path.join(runtimeRoot, 'approved-tasks', `${approvedPacket.taskId}.json`), `${JSON.stringify(approvedPacket)}\n`, 'utf8')
    await approveInitialGates(orchestrator, run.runId)
    await orchestrator.approveDispatch(run.runId, [proposal.nodeId])

    const tamperedPacket = { ...approvedPacket, objective: 'Ownerが承認していない差し替え' }
    await expect(orchestrator.executeApprovedRun(run.runId, { proposal: tamperedPacket })).rejects.toThrow(/matching Owner Decision/)
    await expect(orchestrator.relay.listThreads()).resolves.toEqual([])
  })

  it('does not treat a raw service object or UI state as an approval', async () => {
    const { runtimeRoot, run } = await createFixture()
    const service = new FrontdoorOwnerGateService({ runtimeRoot })
    await expect(service.completeRun(run.runId, 'Project Owner')).rejects.toThrow(/proposed aggregate/)
  })

  it('rejects an aggregate originating from another Run during Result review', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture()
    await approveInitialGates(orchestrator, run.runId)
    await orchestrator.approveDispatch(run.runId, [proposal.nodeId])
    await orchestrator.executeApprovedRun(run.runId, { proposal: packet(run) })
    const aggregatePath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'aggregate.json')
    const aggregate = JSON.parse(await readFile(aggregatePath, 'utf8')) as { runId: string }
    aggregate.runId = 'run-other'
    await writeFile(aggregatePath, `${JSON.stringify(aggregate)}\n`, 'utf8')
    await expect(orchestrator.reviewResult(run.runId)).rejects.toThrow(/another Run|proposed Evidence/)
  })

  it('answers a blocking Question only by returning to explicit Dispatch approval', async () => {
    const { runtimeRoot, orchestrator, run } = await createFixture('partial', 'stop-on-blocking-question')
    await approveInitialGates(orchestrator, run.runId)
    await orchestrator.approveDispatch(run.runId, [proposal.nodeId])
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: packet(run) })
    expect(result.status).toBe('blocked-by-question')
    const question = result.openQuestions[0]
    await orchestrator.answerQuestion(run.runId, question, 'Project Owner', undefined, 'Owner allows explicit re-dispatch review')
    const resumed = await orchestrator.getRun(run.runId)
    expect(resumed.state).toBe('ready-for-approval')
    expect(resumed.ownerGate).toBe('awaiting-owner:dispatch')
    expect(resumed.nodes[0].state).toBe('queued')
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.filter((event) => event.type === 'frontdoor.node-started')).toHaveLength(1)
  })
})
