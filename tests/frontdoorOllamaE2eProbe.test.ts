import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildExplicitAdapterPlan } from '../src/main/jobLoop/adapterRegistry'
import { validateApprovedTask } from '../src/main/jobLoop/contracts'
import { assertLocalSendConfirmation, buildFrontdoorOllamaChildPacket, buildFrontdoorOllamaE2eInput, runFrontdoorOllamaE2eProbe } from '../src/cli/frontdoorOllamaE2eProbe'
import { createLiveRelay } from '../src/main/liveRelay'
import { createFrontdoorRequest } from '../src/main/frontdoor/intake'
import { createDecompositionPlan } from '../src/main/frontdoor/decomposition'
import type { OrchestrationRun } from '../src/shared/frontdoorTypes'

function runFixture(): { run: OrchestrationRun; nodes: ReturnType<typeof createDecompositionPlan>['nodes'] } {
  const input = buildFrontdoorOllamaE2eInput('frontdoor-ollama-probe-test-001')
  const request = createFrontdoorRequest(input.request)
  const plan = createDecompositionPlan(request, input.plan)
  const run = {
    runId: 'run-frontdoor-ollama-probe-test-001',
    requestId: request.requestId,
    requestHash: request.inputHash,
    planHash: plan.planHash,
    state: 'ready-for-approval' as const,
    nodes: plan.nodes.map((node) => ({ node, state: 'ready' as const, childTaskId: `${request.requestId}::${node.nodeId}`, questionIds: [], attempt: 0 })),
    approvalIds: [],
    openQuestionIds: [],
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z'
  }
  return { run, nodes: plan.nodes }
}

describe('ADF-FRONTDOOR-OLLAMA-TWO-NODE-E2E-001 probe contract', () => {
  it('builds a Proposal -> Critic plan on the same explicit Ollama Adapter', () => {
    const input = buildFrontdoorOllamaE2eInput('frontdoor-ollama-probe-test-002')
    expect(input.plan.nodes.map((node) => [node.nodeId, node.adapterId, node.role, node.dependsOn])).toEqual([
      ['proposal', 'ollama-local', 'proposal', []],
      ['critic', 'ollama-local', 'critic', ['proposal']]
    ])
  })

  it('creates valid Owner-bound child Packets for both Nodes', () => {
    const { run, nodes } = runFixture()
    for (const node of nodes) {
      const packet = buildFrontdoorOllamaChildPacket(run, node)
      validateApprovedTask(packet)
      expect(packet.frontdoorBinding).toMatchObject({ runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId })
      expect(packet.adapterPlan.selections).toEqual([{ adapterId: 'ollama-local', role: node.role, rationale: expect.any(String) }])
    }
  })

  it('does not accidentally create an external-send Plan', () => {
    const plan = buildExplicitAdapterPlan('frontdoor-ollama-probe-test-003', 'ollama-local', 'critic', ['read', 'propose'])
    expect(plan.externalSend).toBe(false)
    expect(plan.selections[0]?.adapterId).toBe('ollama-local')
  })

  it('requires an explicit local-send confirmation flag', () => {
    expect(() => assertLocalSendConfirmation(['--runtime-root', '/tmp/runtime'])).toThrow('--confirm-local-send')
    expect(() => assertLocalSendConfirmation(['--confirm-local-send'])).not.toThrow()
  })

  it('uses the same live Relay registration for Electron Main and the Frontdoor CLI', () => {
    const relay = createLiveRelay('/tmp/adf-frontdoor-ollama-probe-test-runtime')
    expect(relay.listExternalAdapterProfiles()).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterId: 'ollama-local', roles: ['proposal', 'critic'], status: 'available' })
    ]))
  })

  it('supports prepare-only without readiness or network access', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-probe-prepare-'))
    await expect(runFrontdoorOllamaE2eProbe(['--runtime-root', runtimeRoot, '--request-id', 'probe-prepare-only-001'])).resolves.toBe(0)
  })

  it('stops a dispatch attempt before readiness when the immediate confirmation flag is absent', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-probe-confirm-'))
    await expect(runFrontdoorOllamaE2eProbe(['--runtime-root', runtimeRoot, '--request-id', 'probe-confirmation-001', '--dispatch'])).resolves.toBe(1)
  })
})
