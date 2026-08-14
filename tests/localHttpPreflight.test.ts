import { describe, expect, it } from 'vitest'
import type { AdapterProfile } from '../src/shared/jobLoopTypes'
import { preflightExternalSend } from '../src/main/jobLoop/externalApproval'
import { OllamaLocalHttpTransport } from '../src/main/jobLoop/ollamaTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-ADAPTER-PROVIDER-NEUTRAL-001', threadId: 'th1', jobId: 'job1', scopeHash: 's', contextHash: 'c', turns: [] } as never
const packet = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
const now = new Date('2026-08-12T00:00:00.000Z')

const ollamaProfile: AdapterProfile = {
  adapterId: 'ollama-local',
  displayName: 'Ollama / Local HTTP Adapter',
  provider: 'ollama',
  connection: 'local-http',
  authMode: 'none',
  status: 'available',
  roles: ['proposal', 'critic'],
  capabilities: ['read', 'propose'],
  costTier: 'free',
  dataPolicy: 'local-only'
}

describe('ADF-ADAPTER-PROVIDER-NEUTRAL-001 local-only / local-http preflight', () => {
  it('passes for a confirmed local endpoint, with no Owner approval file required', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })
    const preflight = preflightExternalSend({ profile: ollamaProfile, adapterRole: 'proposal', transport, packet, approval: null, sendsAlreadyMade: 0, now })

    expect(preflight.ok).toBe(true)
    expect(preflight.checks.find((check) => check.name === 'local-endpoint-confirmed')).toMatchObject({ status: 'pass' })
    // The point of local-only: no approval-file checks even run, so none can appear as a pass or a fail.
    expect(preflight.checks.some((check) => check.name.startsWith('approval-') || check.name === 'owner-approval-present')).toBe(false)
    expect(preflight.checks.find((check) => check.name === 'adapter-declares-external-send')).toMatchObject({ status: 'pass', detail: 'data policy is local-only over a confirmed local-http connection' })
  })

  it('blocks when the endpoint is not confirmed local (the Ollama Cloud / misconfiguration case)', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'https://ollama.cloud-provider.example' })
    const preflight = preflightExternalSend({ profile: ollamaProfile, adapterRole: 'proposal', transport, packet, approval: null, sendsAlreadyMade: 0, now })

    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/local-endpoint-confirmed/)
  })

  it('blocks a planned local-http profile even when its endpoint is local', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })
    const preflight = preflightExternalSend({
      profile: { ...ollamaProfile, status: 'planned' },
      adapterRole: 'proposal',
      transport,
      packet,
      approval: null,
      sendsAlreadyMade: 0,
      now
    })

    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/adapter-available/)
  })

  it('blocks when the Registry profile and injected Transport declare different connection modes', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })
    const preflight = preflightExternalSend({
      profile: { ...ollamaProfile, connection: 'api' },
      adapterRole: 'proposal',
      transport,
      packet,
      approval: null,
      sendsAlreadyMade: 0,
      now
    })

    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/profile-transport-connection-matches/)
  })

  it('still requires the packet role to match the adapter role', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })
    const preflight = preflightExternalSend({ profile: ollamaProfile, adapterRole: 'critic', transport, packet, approval: null, sendsAlreadyMade: 0, now })
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/packet-matches-adapter-role/)
  })

  it('never labels a passing check with the sentence that describes it failing (same guarantee as the external-send path)', () => {
    const transport = new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' })
    const preflight = preflightExternalSend({ profile: ollamaProfile, adapterRole: 'proposal', transport, packet, approval: null, sendsAlreadyMade: 0, now })
    for (const check of preflight.checks.filter((c) => c.status === 'pass')) {
      expect(check.detail, `${check.name} reads as a failure while passing`).not.toMatch(/does not|different|not confirmed|no execution approval/)
    }
  })

  it('does not affect the existing external-send path: adapter-declares-external-send keeps its original pass detail', () => {
    const externalProfile: AdapterProfile = { ...ollamaProfile, adapterId: 'claude-external', connection: 'api', authMode: 'environment-secret', dataPolicy: 'external-send' }
    const transport = { providerId: 'anthropic-messages-api', connection: 'api' as const, credentialStatus: () => ({ required: false, present: true, source: 'x', authMode: 'none' as const }), send: async () => { throw new Error('not reached') } }
    const preflight = preflightExternalSend({ profile: externalProfile, adapterRole: 'proposal', transport, packet, approval: null, sendsAlreadyMade: 0, now })
    expect(preflight.checks.find((check) => check.name === 'adapter-declares-external-send')).toMatchObject({ status: 'pass', detail: 'data policy is external-send' })
    // external-send still requires the Owner approval file — local-only's exemption must not leak here.
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/owner-approval-present/)
  })
})
