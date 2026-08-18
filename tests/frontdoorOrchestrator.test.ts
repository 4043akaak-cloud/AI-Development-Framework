import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, FixtureMode } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { ExternalConversationAdapter } from '../src/main/jobLoop/externalAdapter'
import { OllamaLocalHttpTransport } from '../src/main/jobLoop/ollamaTransport'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { recordRunEvent } from '../src/main/frontdoor/ledger'
import { readFrontdoorEvents, validateFrontdoorEventChain } from '../src/main/frontdoor/eventLedger'
import { assertFrontdoorOllamaEvidence } from '../src/cli/frontdoorOllamaE2eProbe'

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

async function writeOllamaPackets(runtimeRoot: string, run: { runId: string; requestHash: string; planHash: string }, requestId: string, nodes: DecompositionNode[]): Promise<void> {
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  for (const node_ of nodes) {
    const childPacket = boundPacket(run, requestId, node_)
    await writeFile(path.join(runtimeRoot, 'approved-tasks', `${childPacket.taskId}.json`), `${JSON.stringify(childPacket)}\n`, 'utf8')
  }
}

describe('Frontdoor orchestrator', () => {
  it('runs dependent Fake nodes and returns linked Result/Evidence references', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const planNodes = [node('proposal', 'fake-ai-a', 'proposal'), node('critic', 'fake-ai-b', 'critic', ['proposal'])]
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-e2e-001', requestId: baseRequest.requestId, version: 1, nodes: planNodes, aggregationPolicy: 'collect-all', nodeReviewPolicy: 'owner-each-node' })
    await approveDispatch(orchestrator, run.runId, planNodes.map((node_) => node_.nodeId))
    const packets = { proposal: boundPacket(run, baseRequest.requestId, planNodes[0]), critic: boundPacket(run, baseRequest.requestId, planNodes[1]) }
    const first = await orchestrator.executeApprovedRun(run.runId, packets)
    expect(first.status).toBe('partial')
    expect(first.childResultRefs).toHaveLength(1)
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'awaiting-owner', ownerGate: 'awaiting-owner:node-review', nodeReview: { nodeId: 'proposal', nextNodeIds: ['critic'] } })
    await orchestrator.reviewNode(run.runId, 'proposal', 'Project Owner', 'continue')
    const result = await orchestrator.executeApprovedRun(run.runId, packets)
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

  it('stops at Node Review without creating the dependent Critic Thread', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-node-review-stop-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const critic = node('critic', 'fake-ai-b', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-node-review-stop-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'collect-all', nodeReviewPolicy: 'owner-each-node' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])
    const packets = { proposal: boundPacket(run, baseRequest.requestId, proposal), critic: boundPacket(run, baseRequest.requestId, critic) }
    await orchestrator.executeApprovedRun(run.runId, packets)
    await orchestrator.reviewNode(run.runId, proposal.nodeId, 'Project Owner', 'stop', 'Proposalで停止')
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'cancelled', ownerGate: 'stopped' })
    await expect(relay.listThreads()).resolves.toHaveLength(1)
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.some((event) => event.type === 'frontdoor.node-review-opened')).toBe(true)
    expect(events.some((event) => event.type === 'frontdoor.node-review-continued')).toBe(false)
  })

  it('keeps the Owner gate when an auto-continue Plan receives a partial or risky Result', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-auto-continue-risk-'))
    const relay = new ConversationRelay({ runtimeRoot, adapters: [new FakeProposalConversationAdapter('partial'), new FakeCriticConversationAdapter()] })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const critic = node('critic', 'fake-ai-b', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-auto-continue-risk-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'collect-all', nodeReviewPolicy: 'auto-continue-safe' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])
    const packets = { proposal: boundPacket(run, baseRequest.requestId, proposal, 'partial'), critic: boundPacket(run, baseRequest.requestId, critic) }

    const result = await orchestrator.executeApprovedRun(run.runId, packets)

    expect(result.status).toBe('partial')
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'awaiting-owner', ownerGate: 'awaiting-owner:node-review', nodeReview: { nodeId: 'proposal', nextNodeIds: ['critic'] } })
    expect(await relay.listThreads()).toHaveLength(1)
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.some((event) => event.type === 'frontdoor.node-completed' && event.payload.nodeId === 'proposal' && event.payload.autoContinued === false)).toBe(true)
  })

  it('rejects a tampered Node Review target before continuation', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-node-review-tamper-'))
    const relay = new ConversationRelay({ runtimeRoot })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'fake-ai-a', 'proposal')
    const critic = node('critic', 'fake-ai-b', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-node-review-tamper-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'collect-all', nodeReviewPolicy: 'owner-each-node' })
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])
    const packets = { proposal: boundPacket(run, baseRequest.requestId, proposal), critic: boundPacket(run, baseRequest.requestId, critic) }
    await orchestrator.executeApprovedRun(run.runId, packets)
    const runPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json')
    const saved = JSON.parse(await readFile(runPath, 'utf8')) as { nodeReview: { targetHash: string } }
    saved.nodeReview.targetHash = '0'.repeat(64)
    await writeFile(runPath, `${JSON.stringify(saved)}\n`, 'utf8')
    await expect(orchestrator.reviewNode(run.runId, proposal.nodeId, 'Project Owner', 'continue')).rejects.toThrow(/stale or tampered/)
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

describe('ADF-FRONTDOOR-REAL-ADAPTER-DISPATCH-001', () => {
  function ollamaRelay(runtimeRoot: string, modelPresent: boolean, readinessSequence: boolean[] = [modelPresent]): { relay: ConversationRelay; calls: string[]; prompts: string[] } {
    const calls: string[] = []
    const prompts: string[] = []
    let readinessCount = 0
    const transport = new OllamaLocalHttpTransport({
      fetchImpl: async (input, init) => {
        calls.push(input)
        if (input.endsWith('/api/tags')) {
          const present = readinessSequence[Math.min(readinessCount++, readinessSequence.length - 1)] ?? modelPresent
          return new Response(JSON.stringify({ models: present ? [{ name: 'llama3:latest' }] : [] }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        prompts.push(JSON.parse(String(init?.body)).prompt)
        return new Response(JSON.stringify({ response: 'Frontdoor Ollama proposal', done: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    })
    let relay!: ConversationRelay
    const adapter = new ExternalConversationAdapter('ollama-local', ['proposal', 'critic'], transport, {
      authorise: (request) => relay.externalHooks('ollama-local', transport).authorise(request),
      recordCall: (record) => relay.externalHooks('ollama-local', transport).recordCall(record),
      now: () => new Date('2026-08-14T00:00:00.000Z')
    })
    relay = new ConversationRelay({ runtimeRoot, adapters: [adapter], externalTransports: { 'ollama-local': transport } })
    return { relay, calls, prompts }
  }

  it('dispatches one Owner-approved Frontdoor Node through Ollama and returns Result/Evidence/Aggregate', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-ollama-'))
    const { relay, calls, prompts } = ollamaRelay(runtimeRoot, true)
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'ollama-local', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-ollama-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    await writeOllamaPackets(runtimeRoot, run, baseRequest.requestId, [proposal])
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId])

    const result = await orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) })

    expect(result.status).toBe('complete')
    expect(result.childResultRefs).toHaveLength(1)
    expect(calls).toEqual(['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/api/generate'])
    expect((await relay.listThreads())).toHaveLength(1)
    expect(result.evidenceRefs).toHaveLength(1)
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review' })
  })

  it('dispatches dependent Proposal and Critic Nodes through the same multi-role Ollama Adapter', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-ollama-two-role-'))
    const { relay, calls, prompts } = ollamaRelay(runtimeRoot, true)
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'ollama-local', 'proposal')
    const critic = node('critic', 'ollama-local', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-ollama-two-role-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'collect-all', nodeReviewPolicy: 'auto-continue-safe' })
    await writeOllamaPackets(runtimeRoot, run, baseRequest.requestId, [proposal, critic])
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])

    const packets = {
      proposal: boundPacket(run, baseRequest.requestId, proposal),
      critic: boundPacket(run, baseRequest.requestId, critic)
    }

    const result = await orchestrator.executeApprovedRun(run.runId, packets)
    expect(result.status).toBe('complete')
    expect(result.childResultRefs).toHaveLength(2)
    expect((await orchestrator.inspectRun(run.runId)).nodeReview).toBeUndefined()
    await expect(assertFrontdoorOllamaEvidence(runtimeRoot, run.runId, relay)).resolves.toHaveLength(2)
    expect(calls).toEqual([
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:11434/api/generate',
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:11434/api/generate'
    ])
    expect(prompts[1]).toContain('Frontdoor Ollama proposal')
    const criticEnvelope = JSON.parse(await readFile(path.join(runtimeRoot, result.childResultRefs[1]), 'utf8')) as { role: string; taskId: string; jobId: string; inputHash: string; dependencyResults?: Array<{ runId: string; nodeId: string; resultRef: string; resultHash: string }> }
    expect(criticEnvelope.role).toBe('critic')
    expect(criticEnvelope.dependencyResults?.[0]).toMatchObject({ runId: run.runId, nodeId: 'proposal', resultRef: result.childResultRefs[0] })
    const saved = JSON.parse(await readFile(path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'run.json'), 'utf8')) as { nodes: Array<{ node: { nodeId: string; adapterId: string; role: string }; state: string; childJobId?: string; threadId?: string; childInputHash?: string; resultRef?: string; resultHash?: string }> }
    const savedProposal = saved.nodes.find((record) => record.node.nodeId === 'proposal')
    const savedCritic = saved.nodes.find((record) => record.node.nodeId === 'critic')
    expect(savedProposal).toMatchObject({ state: 'completed', node: { adapterId: 'ollama-local', role: 'proposal' }, resultRef: result.childResultRefs[0] })
    expect(savedCritic).toMatchObject({ state: 'completed', node: { adapterId: 'ollama-local', role: 'critic' }, resultRef: result.childResultRefs[1], resultHash: hashJson(criticEnvelope) })
    if (!savedCritic?.childJobId || !savedCritic.threadId) throw new Error('completed Critic record is missing Job or Thread binding')
    expect(savedCritic.childJobId).toBe(criticEnvelope.jobId)
    expect(savedCritic.childInputHash).toBe(criticEnvelope.inputHash)
    const criticThread = JSON.parse(await readFile(path.join(runtimeRoot, 'threads', savedCritic.threadId, 'thread.json'), 'utf8')) as { jobId: string; turns: Array<{ adapterId: string; role: string; orchestrationRunId?: string; resultEnvelopeHash?: string }> }
    expect(criticThread.jobId).toBe(criticEnvelope.jobId)
    expect(criticThread.turns[0]).toMatchObject({ adapterId: 'ollama-local', role: 'critic', orchestrationRunId: run.runId, resultEnvelopeHash: hashJson(criticEnvelope) })
    const evidence = JSON.parse(await readFile(path.join(runtimeRoot, 'threads', savedCritic.threadId, 'evidence-links.json'), 'utf8')) as { jobId: string; turns: Array<{ adapterId: string; role: string; resultEnvelopeRef: string }> }
    expect(evidence).toMatchObject({ jobId: criticEnvelope.jobId, turns: [{ adapterId: 'ollama-local', role: 'critic', resultEnvelopeRef: result.childResultRefs[1] }] })
    const criticCalls = (await readFile(path.join(runtimeRoot, 'threads', savedCritic.threadId, 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { adapterId: string; role: string; threadId: string; jobId: string })
    expect(criticCalls).toEqual(expect.arrayContaining([expect.objectContaining({ adapterId: 'ollama-local', role: 'critic', threadId: savedCritic.threadId, jobId: criticEnvelope.jobId })]))
    const frontdoorEvents = await readFrontdoorEvents(runtimeRoot, run.runId)
    validateFrontdoorEventChain(frontdoorEvents, run.runId)
    expect(frontdoorEvents.some((event) => event.type === 'frontdoor.node-completed' && event.payload.nodeId === 'proposal' && event.payload.autoContinued === true)).toBe(true)
    expect(frontdoorEvents.some((event) => event.type === 'frontdoor.node-completed' && event.payload.nodeId === 'critic')).toBe(true)
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review' })
  })

  it('blocks before Job/Thread creation when Owner dispatch readiness fails', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-ollama-blocked-'))
    const { relay, calls } = ollamaRelay(runtimeRoot, false)
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'ollama-local', 'proposal')
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-ollama-blocked-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
    await writeOllamaPackets(runtimeRoot, run, baseRequest.requestId, [proposal])
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId])

    await expect(orchestrator.executeApprovedRun(run.runId, { proposal: boundPacket(run, baseRequest.requestId, proposal) })).rejects.toThrow(/readiness failed/)
    expect(calls).toEqual(['http://127.0.0.1:11434/api/tags'])
    expect(await relay.listThreads()).toEqual([])
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'ready-for-approval' })
  })

  it('rechecks readiness before the dependent Critic and records a failure without creating its Job/Thread', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-ollama-critic-readiness-'))
    const { relay, calls } = ollamaRelay(runtimeRoot, true, [true, false])
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const proposal = node('proposal', 'ollama-local', 'proposal')
    const critic = node('critic', 'ollama-local', 'critic', ['proposal'])
    const run = await orchestrator.createRun(baseRequest, { planId: 'plan-ollama-critic-readiness-001', requestId: baseRequest.requestId, version: 1, nodes: [proposal, critic], aggregationPolicy: 'collect-all', nodeReviewPolicy: 'owner-each-node' })
    await writeOllamaPackets(runtimeRoot, run, baseRequest.requestId, [proposal, critic])
    await approveDispatch(orchestrator, run.runId, [proposal.nodeId, critic.nodeId])

    const packets = {
      proposal: boundPacket(run, baseRequest.requestId, proposal),
      critic: boundPacket(run, baseRequest.requestId, critic)
    }
    const first = await orchestrator.executeApprovedRun(run.runId, packets)
    expect(first.status).toBe('partial')
    await orchestrator.reviewNode(run.runId, 'proposal', 'Project Owner', 'continue')
    const result = await orchestrator.executeApprovedRun(run.runId, packets)

    expect(result.status).toBe('partial')
    expect(calls).toEqual([
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:11434/api/generate',
      'http://127.0.0.1:11434/api/tags'
    ])
    expect(await relay.listThreads()).toHaveLength(1)
    await expect(orchestrator.getRun(run.runId)).resolves.toMatchObject({ state: 'awaiting-owner' })
  })
})
