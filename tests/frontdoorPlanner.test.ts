import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DecompositionPlan, DecompositionPlanInput, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import type { Capability } from '../src/shared/jobLoopTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { createFrontdoorRequest } from '../src/main/frontdoor/intake'
import { prepareFrontdoorRun } from '../src/main/frontdoor/frontdoorService'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { DeterministicFakePlanner } from '../src/main/frontdoor/planner'

const requestInput: FrontdoorRequestInput = {
  requestId: 'planner-proposal-test-001',
  source: 'test',
  objective: 'Planner Proposalの安全境界を検証する',
  userInput: 'RequestからProposalとCriticのPlan案を作成する',
  projectRef: 'fixture://planner-proposal',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 4, maxDepth: 3, externalSend: false },
  requestedOutput: 'Ownerが確認できるPlan案',
  contextReferences: ['fixture://goal.md'],
  scope: { inScope: ['frontdoor-request'], outOfScope: ['external-send', 'write-canonical'] }
}

function withoutPlanHash(plan: DecompositionPlan): DecompositionPlanInput {
  const { planHash: _planHash, ...input } = plan
  return input
}

describe('ADF-FRONTDOOR-PLANNER-PROPOSAL-001', () => {
  it('generates a deterministic, local-only proposal without creating a Run', async () => {
    const request = createFrontdoorRequest(requestInput, '2026-08-14T00:00:00.000Z')
    const planner = new DeterministicFakePlanner()
    const first = await planner.propose(request)
    const second = await planner.propose(request)

    expect(first.plannerId).toBe('fake-planner')
    expect(first.plannerVersion).toBe('v1')
    expect(first.requestHash).toBe(request.inputHash)
    expect(first.plan).toEqual(second.plan)
    expect(first.registrySnapshotHash).toBe(second.registrySnapshotHash)
    expect(first.plan.nodes.map((node) => [node.adapterId, node.role])).toEqual([
      ['fake-ai-a', 'proposal'],
      ['fake-ai-b', 'critic']
    ])
    expect(first.plan.nodes[1].dependsOn).toEqual(['proposal'])
  })

  it('reduces the proposal to one node when the approved limits allow no critic', async () => {
    const request = createFrontdoorRequest({
      ...requestInput,
      requestId: 'planner-proposal-test-single',
      constraints: { ...requestInput.constraints, maxNodes: 1, maxDepth: 1 }
    }, '2026-08-14T00:00:00.000Z')
    const proposal = await new DeterministicFakePlanner().propose(request)

    expect(proposal.plan.nodes).toHaveLength(1)
    expect(proposal.plan.nodes[0].nodeId).toBe('proposal')
    expect(proposal.plan.planHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('fails closed when the Request grants no supported local planning capability', async () => {
    const request = createFrontdoorRequest({
      ...requestInput,
      requestId: 'planner-proposal-test-capability',
      constraints: { ...requestInput.constraints, allowedCapabilities: ['implementation'] as unknown as Capability[] }
    }, '2026-08-14T00:00:00.000Z')

    await expect(new DeterministicFakePlanner().propose(request)).rejects.toThrow(/requires read or propose/)
  })

  it('hands the Owner-reviewed proposal to Prepare only as an Intake-gated Run', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-planner-proposal-'))
    const relay = new ConversationRelay({ runtimeRoot, adapters: [] })
    const orchestrator = new FrontdoorOrchestrator({ relay })
    const request = createFrontdoorRequest(requestInput, '2026-08-14T00:00:00.000Z')
    const proposal = await new DeterministicFakePlanner().propose(request)
    const prepared = await prepareFrontdoorRun(orchestrator, { request: requestInput, plan: withoutPlanHash(proposal.plan) })

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.value.reused).toBe(false)
    expect(prepared.value.run.ownerGate).toBe('awaiting-owner:intake')
    expect(prepared.value.run.nodes.every((node) => !node.childJobId && !node.threadId)).toBe(true)
  })
})
