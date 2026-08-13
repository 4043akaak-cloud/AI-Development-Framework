import { describe, expect, it } from 'vitest'
import type { AdapterPlan, AdapterProfile } from '../src/shared/jobLoopTypes'
import { AdapterRegistryError, adapterProfiles, buildExplicitAdapterPlan, checkAdapterPlanMembership, routeAdapters, supports } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { ResultEnvelopeRejectedError, validateResultEnvelope, type AdapterResultEnvelope } from '../src/main/jobLoop/resultEnvelope'

describe('multi-AI adapter foundation', () => {
  it('uses the lowest-cost local adapter registered for each role', () => {
    const plan = routeAdapters('ADF-CLAUDE-ADAPTER-001', ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(plan.externalSend).toBe(false)
  })

  it('does not auto-select a planned external adapter', () => {
    expect(() => routeAdapters('ADF-CLAUDE-ADAPTER-001', ['implementation'], ['read', 'propose'])).toThrow(/no local available adapter/i)
  })

  it('never auto-routes a local-http adapter, even if it were available (Ollama-style misconfiguration guard)', () => {
    // Independent of `status`: a hypothetical *available* local-http profile must still be excluded.
    const hypotheticalAvailableOllama: AdapterProfile = {
      adapterId: 'ollama-hypothetical',
      displayName: 'Ollama / hypothetical available',
      provider: 'ollama',
      connection: 'local-http',
      authMode: 'none',
      status: 'available',
      roles: ['proposal'],
      capabilities: ['read', 'propose'],
      costTier: 'free',
      dataPolicy: 'local-only'
    }
    expect(supports(hypotheticalAvailableOllama, 'proposal', ['read', 'propose'], 'free')).toBe(false)
  })

  it('registers ollama-local: available, local-http, local-only, no credential (ADF-OLLAMA-LIVE-CONNECTION-001)', () => {
    const ollama = adapterProfiles.find((profile) => profile.adapterId === 'ollama-local')
    expect(ollama).toMatchObject({ provider: 'ollama', connection: 'local-http', authMode: 'none', status: 'available', dataPolicy: 'local-only' })
  })

  it('still never auto-routes ollama-local now that it is available (the real Registry entry, not a hypothetical one)', () => {
    const plan = routeAdapters('ADF-OLLAMA-LIVE-CONNECTION-001', ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(plan.selections.some((selection) => selection.adapterId === 'ollama-local')).toBe(false)
  })

  it('buildExplicitAdapterPlan names exactly one Owner-chosen adapter, not the auto-routed result (ADF-OLLAMA-LIVE-CONNECTION-001 Packet/Dispatch boundary fix)', () => {
    const plan = buildExplicitAdapterPlan('ADF-OLLAMA-LIVE-CONNECTION-001', 'ollama-local', 'proposal', ['read', 'propose'])
    expect(plan).toMatchObject({
      version: 'v1',
      externalSend: false,
      selections: [{ adapterId: 'ollama-local', role: 'proposal' }]
    })
    expect(plan.selections).toHaveLength(1)
    // Confirms this is not just routeAdapters in disguise: auto-routing would have picked fake-ai-a.
    expect(plan.selections[0]?.adapterId).not.toBe('fake-ai-a')
  })

  it('buildExplicitAdapterPlan rejects an adapter that does not support the requested role', () => {
    expect(() => buildExplicitAdapterPlan('T', 'ollama-local', 'implementation', ['read', 'propose'])).toThrow(AdapterRegistryError)
    expect(() => buildExplicitAdapterPlan('T', 'ollama-local', 'implementation', ['read', 'propose'])).toThrow(/does not support role/)
  })

  it('buildExplicitAdapterPlan rejects a planned (not available) adapter', () => {
    expect(() => buildExplicitAdapterPlan('T', 'claude-code-first-real', 'implementation', ['read', 'propose'])).toThrow(/is not available/)
  })

  it('buildExplicitAdapterPlan rejects an external-send adapter, the same MVP boundary validateAdapterPlan enforces', () => {
    expect(() => buildExplicitAdapterPlan('T', 'claude-external', 'proposal', ['read', 'propose'])).toThrow(/outside local-only MVP boundary/)
  })

  it('buildExplicitAdapterPlan rejects an unknown adapterId', () => {
    expect(() => buildExplicitAdapterPlan('T', 'no-such-adapter', 'proposal', ['read', 'propose'])).toThrow(/unknown adapter/)
  })

  it('gives every registered adapter a provider and an authMode (no bare adapterId-as-provider)', () => {
    for (const profile of adapterProfiles) {
      expect(profile.provider, `${profile.adapterId} is missing provider`).toBeTruthy()
      expect(profile.authMode, `${profile.adapterId} is missing authMode`).toBeTruthy()
    }
  })

  it('registers claude-code-cli as planned/cli/environment-secret/external-send (ADF-CLAUDE-CODE-CLI-ADAPTER-001)', () => {
    const profile = adapterProfiles.find((candidate) => candidate.adapterId === 'claude-code-cli')
    expect(profile).toMatchObject({ provider: 'anthropic', connection: 'cli', authMode: 'environment-secret', status: 'planned', dataPolicy: 'external-send' })
  })

  it('never selects claude-code-cli via routeAdapters while it is planned', () => {
    const plan = routeAdapters('ADF-CLAUDE-CODE-CLI-ADAPTER-001', ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(plan.selections.some((selection) => selection.adapterId === 'claude-code-cli')).toBe(false)
  })

  it('validates structured adapter results against the approved Job input', () => {
    const envelope: AdapterResultEnvelope = {
      resultId: 'result-fake-ai-a-1',
      jobId: 'job-1',
      taskId: 'ADF-CLAUDE-ADAPTER-001',
      adapterId: 'fake-ai-a',
      role: 'proposal',
      inputHash: 'input-hash',
      scopeHash: 'scope-hash',
      contextHash: 'context-hash',
      status: 'success',
      summary: 'Fake proposal returned',
      artifact: { artifactId: 'artifact-1' },
      verification: [{ name: 'shape', status: 'pass' }],
      risks: [],
      ownerDecisionRequired: true,
      nextOwnerDecision: 'Review proposal',
      createdAt: '2026-08-10T00:00:00.000Z',
      durationMs: 10,
      terminationReason: 'completed'
    }
    expect(() => validateResultEnvelope(envelope, { taskId: envelope.taskId, jobId: envelope.jobId, inputHash: envelope.inputHash })).not.toThrow()
    expect(() => validateResultEnvelope(envelope, { taskId: 'wrong-task', jobId: envelope.jobId, inputHash: envelope.inputHash })).toThrow(ResultEnvelopeRejectedError)
  })
})

describe('checkAdapterPlanMembership (ADF-OLLAMA-FIRST-CLASS-ADAPTER-001 shared Plan-binding helper)', () => {
  it('passes when adapterId, role, and routingPlanHash all match the approved Plan', () => {
    const plan = buildExplicitAdapterPlan('T', 'ollama-local', 'proposal', ['read', 'propose'])
    const result = checkAdapterPlanMembership(plan, hashJson(plan), 'ollama-local', 'proposal')
    expect(result).toMatchObject({ ok: true })
  })

  it('rejects when the Plan does not name this adapterId at all (fake-ai-a approved, ollama-local requested)', () => {
    const plan = routeAdapters('T', ['proposal', 'critic'], ['read', 'propose'])
    const result = checkAdapterPlanMembership(plan, hashJson(plan), 'ollama-local', 'proposal')
    expect(result).toMatchObject({ ok: false })
    expect(result.detail).toMatch(/does not include ollama-local/)
  })

  it('rejects when the Plan names this adapterId for a different role', () => {
    const plan = buildExplicitAdapterPlan('T', 'ollama-local', 'critic', ['read', 'propose'])
    const result = checkAdapterPlanMembership(plan, hashJson(plan), 'ollama-local', 'proposal')
    expect(result).toMatchObject({ ok: false })
    expect(result.detail).toMatch(/approves ollama-local for role critic, not proposal/)
  })

  it('rejects when the adapterPlan does not hash to the given routingPlanHash (stale or tampered), even if the selection would otherwise match', () => {
    const plan = buildExplicitAdapterPlan('T', 'ollama-local', 'proposal', ['read', 'propose'])
    const result = checkAdapterPlanMembership(plan, 'tampered-hash', 'ollama-local', 'proposal')
    expect(result).toMatchObject({ ok: false })
    expect(result.detail).toMatch(/stale or tampered/)
  })

  it('checks routingPlanHash integrity before selection membership, so a tampered Plan is never trusted even for an adapterId it happens to contain', () => {
    const plan: AdapterPlan = { version: 'v1', selections: [{ adapterId: 'ollama-local', role: 'proposal', rationale: 'x' }], externalSend: false, maxCostTier: 'free' }
    const result = checkAdapterPlanMembership(plan, 'not-the-real-hash', 'ollama-local', 'proposal')
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/stale or tampered/)
  })
})
