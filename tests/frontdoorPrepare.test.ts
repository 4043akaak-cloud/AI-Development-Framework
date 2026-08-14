import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DecompositionNode, FrontdoorPrepareInput, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { prepareFrontdoorRunOrThrow } from '../src/main/frontdoor/frontdoorPrepareService'
import { prepareFrontdoorRun } from '../src/main/frontdoor/frontdoorService'

const scope = { inScope: ['frontdoor-request'], outOfScope: ['external-send', 'write-canonical'] }

function input(overrides: Partial<FrontdoorPrepareInput['request']> = {}): FrontdoorPrepareInput {
  const requestId = overrides.requestId ?? 'frontdoor-prepare-test-001'
  const baseRequest: FrontdoorRequestInput = {
    requestId,
    source: 'test' as const,
    objective: 'Frontdoor Request Intakeを検証する',
    userInput: 'Fake Adapterで検証用のProposalを作成する',
    projectRef: 'fixture://frontdoor-prepare',
    constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
    requestedOutput: 'Ownerが確認できるProposal',
    contextReferences: ['fixture://owner-request'],
    scope,
  }
  const request: FrontdoorRequestInput = {
    ...baseRequest,
    ...overrides
  }
  const node: DecompositionNode = {
    nodeId: 'proposal',
    objective: request.objective,
    role: 'proposal',
    adapterId: 'fake-ai-a',
    scope,
    contextReferences: ['fixture://owner-request'],
    acceptance: ['Proposalを返す'],
    stopConditions: ['Scope外要求'],
    capabilities: ['read', 'propose'],
    dependsOn: [],
    depth: 1
  }
  return {
    request,
    plan: { planId: 'frontdoor-prepare-plan-001', requestId, version: 1, nodes: [node], aggregationPolicy: 'collect-all' }
  }
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-prepare-'))
  const relay = new ConversationRelay({ runtimeRoot: path.join(root, 'runtime'), adapters: [new FakeProposalConversationAdapter(), new FakeCriticConversationAdapter()] })
  return { relay, orchestrator: new FrontdoorOrchestrator({ relay }) }
}

describe('Frontdoor Request Intake boundary', () => {
  it('creates an Intake-gated Run without Job, Thread, Packet, or Adapter send', async () => {
    const fixture = await harness()
    const result = await prepareFrontdoorRun(fixture.orchestrator, input())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.reused).toBe(false)
    expect(result.value.run.state).toBe('ready-for-approval')
    expect(result.value.run.ownerGate).toBe('awaiting-owner:intake')
    expect(await fixture.relay.listThreads()).toEqual([])
  })

  it('reuses identical Request IDs and rejects changed content', async () => {
    const fixture = await harness()
    const first = await prepareFrontdoorRunOrThrow(fixture.orchestrator, input())
    const second = await prepareFrontdoorRunOrThrow(fixture.orchestrator, input())
    expect(second.reused).toBe(true)
    expect(second.run.runId).toBe(first.run.runId)
    await expect(prepareFrontdoorRunOrThrow(fixture.orchestrator, input({ objective: '改ざんされた目的' }))).rejects.toThrow(/different Request content/)
  })

  it('rejects unsafe Request IDs and non-local or unknown Plan adapters before writing a Run', async () => {
    const fixture = await harness()
    expect((await prepareFrontdoorRun(fixture.orchestrator, input({ requestId: '../escape' }))).ok).toBe(false)
    const unknown = input({ requestId: 'frontdoor-prepare-unknown-001' })
    unknown.plan.nodes[0].adapterId = 'unknown-adapter'
    expect((await prepareFrontdoorRun(fixture.orchestrator, unknown)).ok).toBe(false)
    const external = input({ requestId: 'frontdoor-prepare-external-001' })
    external.plan.nodes[0].adapterId = 'claude-external'
    expect((await prepareFrontdoorRun(fixture.orchestrator, external)).ok).toBe(false)
    const unregistered = input({ requestId: 'frontdoor-prepare-unregistered-001' })
    unregistered.plan.nodes[0].adapterId = 'ollama-local'
    expect((await prepareFrontdoorRun(fixture.orchestrator, unregistered)).ok).toBe(false)
    expect(await fixture.relay.listThreads()).toEqual([])
  })
})
