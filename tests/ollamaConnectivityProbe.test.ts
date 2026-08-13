import { describe, expect, it } from 'vitest'
import type { AdapterPlan, ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import { buildExplicitAdapterPlan, getAdapterProfile, routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { OllamaLocalHttpTransport } from '../src/main/jobLoop/ollamaTransport'
import { assertExplicitDispatchIsApproved, OllamaDispatchBoundaryError } from '../src/cli/ollamaConnectivityProbe'

const taskId = 'ADF-OLLAMA-LIVE-CONNECTION-001'

function packetWithPlan(adapterPlan: AdapterPlan): ApprovedTaskPacket {
  const scope = { inScope: ['probe fixture'], outOfScope: [] }
  const context = { githubTask: `docs/tasks/${taskId}.md`, obsidianContext: [], adoptedPrinciples: ['owner-approval'] }
  const scopeHash = hashJson(scope)
  return {
    taskId,
    objective: 'fixture',
    scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: ['fixture'],
    stopConditions: ['fixture'],
    approval: {
      approvalId: `approval-${taskId.toLowerCase()}`,
      taskId,
      status: 'active',
      approvedBy: 'Project Owner',
      approvedAt: '2026-08-13T00:00:00.000Z',
      expiresAt: '2099-12-31T23:59:59.000Z',
      scopeHash,
      routingPlanHash: hashJson(adapterPlan),
      capabilities: ['read', 'propose']
    },
    adapter: 'multi-ai-routing-v1',
    fixtureMode: 'success',
    target: {
      repository: `fixture://${taskId}`,
      branch: `fixture/${taskId}`,
      worktree: `fixture://${taskId}-worktree`,
      allowedFiles: [`docs/tasks/${taskId}.md`],
      forbiddenChanges: ['commit', 'push']
    },
    adapterPlan
  }
}

const ollamaProfile = () => getAdapterProfile('ollama-local')
const localTransport = () => new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })

describe('assertExplicitDispatchIsApproved (ADF-OLLAMA-LIVE-CONNECTION-001 Packet/Dispatch boundary fix)', () => {
  it('passes when the Packet explicitly approves this adapterId for this role', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() })).not.toThrow()
  })

  it('rejects when the approved Plan names a different adapter entirely (the exact Owner-flagged bug: Plan says fake-ai-a, Thread dispatched to ollama-local)', () => {
    const plan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.selections.map((s) => s.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    const packet = packetWithPlan(plan)
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() }))
      .toThrow(OllamaDispatchBoundaryError)
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() }))
      .toThrow(/does not include ollama-local/)
  })

  it('rejects when the Plan approves this adapter for a different role', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'critic', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() }))
      .toThrow(/approves ollama-local for role critic, not proposal/)
  })

  it('rejects a tampered/stale routingPlanHash even if the selection would otherwise match', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    packet.approval.routingPlanHash = 'tampered-hash'
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() }))
      .toThrow(/stale or tampered approval/)
  })

  it('rejects when the Registry profile is not available', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    const notAvailable = { ...ollamaProfile(), status: 'planned' as const }
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: notAvailable, transport: localTransport() }))
      .toThrow(/adapter status is planned/)
  })

  it('rejects when the Registry profile and Transport disagree on connection kind', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    const mismatched = { ...ollamaProfile(), connection: 'api' as const }
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: mismatched, transport: localTransport() }))
      .toThrow(/Registry profile connection is api, Transport connection is local-http/)
  })

  it('rejects when the Transport does not confirm a local endpoint (misconfiguration guard)', () => {
    const plan = buildExplicitAdapterPlan(taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    const packet = packetWithPlan(plan)
    const cloudTransport = new OllamaLocalHttpTransport({ baseUrl: 'https://ollama.cloud-provider.example' })
    expect(() => assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: cloudTransport }))
      .toThrow(/does not confirm a local endpoint/)
  })

  it('reports every violation at once, not just the first', () => {
    const plan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
    const packet = packetWithPlan(plan)
    packet.approval.routingPlanHash = 'tampered-hash'
    try {
      assertExplicitDispatchIsApproved({ packet, adapterId: 'ollama-local', role: 'proposal', profile: ollamaProfile(), transport: localTransport() })
      expect.unreachable('expected assertExplicitDispatchIsApproved to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(OllamaDispatchBoundaryError)
      const details = (error as OllamaDispatchBoundaryError).details
      expect(details.some((d) => d.includes('stale or tampered approval'))).toBe(true)
      expect(details.some((d) => d.includes('does not include ollama-local'))).toBe(true)
    }
  })
})
