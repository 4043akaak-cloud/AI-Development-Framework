import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { writeJsonAtomic } from '../src/main/jobLoop/ledger'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { approvedTaskDirectory } from '../src/main/relayService'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { approveFrontdoorRun, completeFrontdoorRun, dispatchFrontdoorRun, inspectFrontdoorRun, listFrontdoorRuns, reviewFrontdoorResult } from '../src/main/frontdoor/frontdoorService'

const scope = { inScope: ['frontdoor-ui'], outOfScope: ['external-send', 'write-canonical'] }
const request: FrontdoorRequestInput = {
  requestId: 'frontdoor-ipc-test-001',
  source: 'test',
  objective: 'Electron Frontdoor IPCを検証する',
  userInput: 'Fake AdapterをOwner Gate経由で一周させる',
  projectRef: 'fixture://frontdoor-ipc',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: 'OwnerがInspectできるResult',
  contextReferences: ['fixture://goal.md'],
  scope
}
const node: DecompositionNode = {
  nodeId: 'proposal',
  objective: request.objective,
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope,
  contextReferences: ['fixture://goal.md'],
  acceptance: ['ResultとEvidenceを生成する'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-ipc-'))
  const relay = new ConversationRelay({ runtimeRoot: path.join(root, 'runtime'), adapters: [new FakeProposalConversationAdapter(), new FakeCriticConversationAdapter()] })
  const orchestrator = new FrontdoorOrchestrator({ relay })
  const run = await orchestrator.createRun(request, { planId: 'frontdoor-ipc-plan-001', requestId: request.requestId, version: 1, nodes: [node], aggregationPolicy: 'collect-all' })
  return { root, relay, orchestrator, run }
}

async function placePacket(relay: ConversationRelay, run: { runId: string; requestHash: string; planHash: string }): Promise<void> {
  const taskId = `${request.requestId}::proposal`
  const adapterPlan = buildExplicitAdapterPlan(taskId, node.adapterId, node.role, node.capabilities)
  const context = { githubTask: 'fixture://goal.md', obsidianContext: ['fixture://goal.md'], adoptedPrinciples: ['owner-approval'] }
  const packet: ApprovedTaskPacket = {
    taskId,
    objective: node.objective,
    scope: node.scope,
    scopeHash: hashJson(node.scope),
    context,
    contextHash: hashJson(context),
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: { approvalId: 'approval-frontdoor-ipc-001', taskId, status: 'active', approvedBy: 'Project Owner', approvedAt: '2026-08-14T00:00:00.000Z', expiresAt: '2099-12-31T23:59:59.000Z', scopeHash: hashJson(node.scope), routingPlanHash: hashJson(adapterPlan), capabilities: node.capabilities },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: { repository: 'fixture://frontdoor-ipc', branch: 'fixture/frontdoor-ipc', worktree: 'fixture://frontdoor-ipc', allowedFiles: [], forbiddenChanges: ['external-send', 'write-canonical'] },
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId }
  }
  await writeJsonAtomic(path.join(approvedTaskDirectory(relay), `${taskId}.json`), packet)
}

async function approveAll(orchestrator: FrontdoorOrchestrator, runId: string): Promise<void> {
  expect((await approveFrontdoorRun(orchestrator, { runId, gate: 'intake', approvedBy: 'Project Owner' })).ok).toBe(true)
  expect((await approveFrontdoorRun(orchestrator, { runId, gate: 'completion-shape', approvedBy: 'Project Owner' })).ok).toBe(true)
  expect((await approveFrontdoorRun(orchestrator, { runId, gate: 'decomposition', approvedBy: 'Project Owner' })).ok).toBe(true)
  expect((await approveFrontdoorRun(orchestrator, { runId, gate: 'dispatch', nodeIds: ['proposal'], approvedBy: 'Project Owner' })).ok).toBe(true)
}

describe('Frontdoor Electron service boundary', () => {
  it('lists and inspects Runs read-only, without implicit Owner identity', async () => {
    const fixture = await harness()
    const listed = await listFrontdoorRuns(fixture.orchestrator)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value).toHaveLength(1)
    expect(listed.value[0].packetsReady).toBe(false)
    const inspected = await inspectFrontdoorRun(fixture.orchestrator, fixture.run.runId)
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) return
    expect(inspected.value.run.runId).toBe(fixture.run.runId)
    expect(inspected.value.nextAction).toContain('intake')
    expect((await approveFrontdoorRun(fixture.orchestrator, { runId: fixture.run.runId, gate: 'intake', approvedBy: '' })).ok).toBe(false)
    expect((await approveFrontdoorRun(fixture.orchestrator, { runId: fixture.run.runId, gate: 'unknown', approvedBy: 'Project Owner' })).ok).toBe(false)
  })

  it('loads only the Run-bound child Packets and completes the explicit UI loop', async () => {
    const fixture = await harness()
    expect((await dispatchFrontdoorRun(fixture.orchestrator, fixture.run.runId)).ok).toBe(false)
    await placePacket(fixture.relay, fixture.run)
    expect((await dispatchFrontdoorRun(fixture.orchestrator, fixture.run.runId)).ok).toBe(false)
    await approveAll(fixture.orchestrator, fixture.run.runId)
    const listed = await listFrontdoorRuns(fixture.orchestrator)
    expect(listed.ok && listed.value[0].packetsReady).toBe(true)
    const dispatched = await dispatchFrontdoorRun(fixture.orchestrator, fixture.run.runId)
    expect(dispatched.ok).toBe(true)
    const reviewed = await reviewFrontdoorResult(fixture.orchestrator, { runId: fixture.run.runId, approvedBy: 'Project Owner', decision: 'accept' })
    expect(reviewed.ok).toBe(true)
    const completed = await completeFrontdoorRun(fixture.orchestrator, { runId: fixture.run.runId, approvedBy: 'Project Owner' })
    expect(completed.ok).toBe(true)
    if (completed.ok) expect(completed.value.state).toBe('complete')
  })
})
