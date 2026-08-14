import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, FixtureMode } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { recordRunEvent } from '../src/main/frontdoor/ledger'

const baseScope = { inScope: ['proposal', 'critique', 'aggregation'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
const baseRequest: FrontdoorRequestInput = {
  requestId: 'frontdoor-e2e-001',
  source: 'test',
  objective: 'Fake AIへ依頼を分解する',
  userInput: 'ProposalとCriticの結果を集約する',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 3, maxDepth: 2, externalSend: false },
  requestedOutput: '集約結果',
  contextReferences: ['fixture://goal.md'],
  scope: baseScope
}

function node(nodeId: string, adapterId: string, role: 'proposal' | 'critic', dependsOn: string[] = []): DecompositionNode {
  return { nodeId, objective: `${nodeId}を実行する`, role, adapterId, scope: baseScope, contextReferences: ['fixture://goal.md'], acceptance: ['Resultを返す'], stopConditions: ['Scope外要求'], capabilities: ['read', 'propose'], dependsOn, depth: dependsOn.length ? 2 : 1 }
}

function packet(requestId: string, node_: DecompositionNode, fixtureMode: FixtureMode = 'success', binding?: { runId: string; requestHash: string; planHash: string }): ApprovedTaskPacket {
  const taskId = `${requestId}::${node_.nodeId}`
  const adapterPlan = buildExplicitAdapterPlan(taskId, node_.adapterId, node_.role, ['read', 'propose'])
  const scopeHash = hashJson(node_.scope)
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-approval', 'evidence-before-integration'] }
  return {
    taskId,
    objective: node_.objective,
    scope: node_.scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: node_.acceptance,
    stopConditions: node_.stopConditions,
    approval: { approvalId: `approval-${taskId}`, taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z', scopeHash, routingPlanHash: hashJson(adapterPlan), capabilities: ['read', 'propose'] },
    adapter: 'frontdoor-child',
    fixtureMode,
    target: { repository: 'fixture://adf', branch: 'fixture/frontdoor', worktree: 'fixture://frontdoor', allowedFiles: ['docs/tasks/fixture.md'], forbiddenChanges: ['external-send', 'write-canonical', 'commit', 'push'] },
    adapterPlan,
    ...(binding ? { frontdoorBinding: { ...binding, nodeId: node_.nodeId } } : {})
  }
}

function boundPacket(run: { runId: string; requestHash: string; planHash: string }, requestId: string, node_: DecompositionNode, fixtureMode: FixtureMode = 'success'): ApprovedTaskPacket {
  return packet(requestId, node_, fixtureMode, run)
}

async function approveDispatch(orchestrator: FrontdoorOrchestrator, runId: string, nodeIds: string[]): Promise<void> {
  await orchestrator.approveIntake(runId)
  await orchestrator.approveCompletionShape(runId)
  await orchestrator.approveDecomposition(runId)
  await orchestrator.approveDispatch(runId, nodeIds)
}

describe('Frontdoor orchestrator', () => {
  it('runs dependent Fake nodes and returns linked Result/Evidence references', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const planNodes = [node('proposal', 'fake-ai-a', 'proposal'), node('critic', 'fake-ai-b', 'critic', ['proposal'])]
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-e2e-001', requestId: baseRequest.requestId, version: 1, nodes: planNodes, aggregationPolicy: 'collect-all' })
    await approveDispatch(orchestrator, run.runId, planNodes.map((node_) => node_.nodeId))
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, planNodes[0]), critic: boundPacket(run, baseRequest.requestId, planNodes[1]) })
    expect(result.status).toBe('complete')
    expect(result.childResultRefs).toHaveLength(2)
    expect(result.ownerDecisionRequired).toBe(true)
    const saved = JSON.parse(await readFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json'), 'utf8')) as { nodes: Array<{ node: { nodeId: string }; state: string; threadId?: string }> }
    expect(saved.nodes.map((node_) => node_.state)).toEqual(['completed', 'completed'])
    expect(saved.nodes.every((node_) => node_.threadId)).toBe(true)
    const criticEnvelope = JSON.parse(await readFile(path.join(runtimeRoot, result.childResultRefs[1]), 'utf8')) as { dependencyResults?: Array<{ runId: string; nodeId: string; resultRef: string; resultHash: string }> }
    expect(criticEnvelope.dependencyResults?.[0]).toMatchObject({ runId: run.runId, nodeId: 'proposal', resultRef: result.childResultRefs[0] })
    expect(criticEnvelope.dependencyResults?.[0].resultHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns blocked-by-question for a partial Fake result and does not flatten it to failed', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-question-'))
    const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter('partial')] })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-question-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'stop-on-blocking-question' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId])
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal, 'partial') })
    expect(result.status).toBe('blocked-by-question')
    expect(result.openQuestions[0].blocking).toBe(true)
  })

  it('stops queued nodes when the policy is stop-on-blocking-question', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-question-stop-'))
    const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter('partial')] })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const critic = node('critic', 'fake-ai-b', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-question-stop-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'stop-on-blocking-question' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal, 'partial'), critic: boundPacket(run, baseRequest.requestId, critic) })
    const saved = JSON.parse(await readFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json'), 'utf8')) as { nodes: Array<{ node: { nodeId: string }; state: string; threadId?: string }> }
    expect(result.status).toBe('blocked-by-question')
    expect(saved.nodes.find((node_) => node_.node.nodeId === 'proposal')?.state).toBe('awaiting-question')
    expect(saved.nodes.find((node_) => node_.node.nodeId === 'critic')?.state).toBe('cancelled')
    expect(saved.nodes.find((node_) => node_.node.nodeId === 'critic')?.threadId).toBeUndefined()
  })

  it('propagates a failed dependency through a deep DAG and returns an aggregate', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-failure-'))
    const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter('failed')] })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const critic = node('critic', 'fake-ai-b', 'critic', ['proposal'])
    const aggregation = node('aggregation', 'fake-ai-b', 'critic', ['critic'])
    const run = await orchestrator.createRun({ ...baseRequest, constraints: { ...baseRequest.constraints, maxDepth: 3 } }, { planId: 'plan-failure-deep-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic, { ...aggregation, depth: 3 }], aggregationPolicy: 'collect-all' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId, aggregation.nodeId])
    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal, 'failed'), critic: boundPacket(run, baseRequest.requestId, critic), aggregation: boundPacket(run, baseRequest.requestId, aggregation) })
    const saved = JSON.parse(await readFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json'), 'utf8')) as { nodes: Array<{ node: { nodeId: string }; state: string }> }
    expect(result.status).toBe('failed')
    expect(saved.nodes.map((node_) => node_.state)).toEqual(['failed', 'cancelled', 'cancelled'])
  })

  it('rejects a tampered run bundle before dispatch', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-tamper-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-tamper-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    const runPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json')
    const saved = JSON.parse(await readFile(runPath, 'utf8')) as { nodes: Array<{ node: DecompositionNode }> }
    saved.nodes[0].node.objective = '改ざんされた実行対象'
    await writeFile(runPath, `${JSON.stringify(saved)}\n`, 'utf8')
    await expect(orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) })).rejects.toThrow(/integrity|does not match|manifest/)
  })

  it('recovers interrupted nodes and supports Owner stop without retry', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-recovery-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-recovery-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    const runPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json')
    const saved = JSON.parse(await readFile(runPath, 'utf8')) as { state: string; nodes: Array<{ state: string }> }
    saved.state = 'running'
    saved.nodes[0].state = 'running'
    await writeFile(runPath, `${JSON.stringify(saved)}\n`, 'utf8')
    await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.approval-bound', { approvalIds: ['approval-recovery'] })
    await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.node-started', { nodeId: proposal.nodeId, childTaskId: `${baseRequest.requestId}::${proposal.nodeId}`, attempt: 1 })
    await writeFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.claim.json'), `${JSON.stringify({ runId: run.runId, owner: 'stale-process', token: 'stale-token', pid: 999999, hostname: process.env.HOSTNAME ?? 'unknown', claimedAt: '2020-01-01T00:00:00.000Z' })}\n`, 'utf8')
    const recovered = await orchestrator.recoverRun(run.runId)
    expect(recovered.state).toBe('awaiting-owner')
    expect(recovered.nodes[0].state).toBe('recovery-needed')
    await expect(readFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.claim.json'), 'utf8')).rejects.toThrow()
    const stopped = await orchestrator.stopRun(run.runId, 'Owner stop for recovery review')
    expect(stopped.state).toBe('cancelled')
    expect(stopped.nodes[0].state).toBe('cancelled')
  })

  it('rejects concurrent execution of one run with an exclusive claim', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-claim-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-claim-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId])
    const results = await Promise.allSettled([
      orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) }),
      orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) })
    ])
    expect(results.filter((result_) => result_.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result_) => result_.status === 'rejected')).toHaveLength(1)
  })

  it('rejects a run reset to ready after an approval event', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-state-tamper-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-state-tamper-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    const runPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json')
    const saved = JSON.parse(await readFile(runPath, 'utf8')) as { state: string }
    saved.state = 'ready-for-approval'
    await writeFile(runPath, `${JSON.stringify(saved)}\n`, 'utf8')
    await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.approval-bound', { approvalIds: ['approval-tampered'] })
    await expect(orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) })).rejects.toThrow(/execution events|event replay/)
  })
})
