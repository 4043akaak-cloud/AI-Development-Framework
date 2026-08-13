import { describe, expect, it } from 'vitest'
import type { ExternalPreflight } from '../src/shared/externalAdapterTypes'
import type { OllamaReadiness } from '../src/shared/externalAdapterTypes'
import { isSendEnabled } from '../src/renderer/src/externalSendGate'

function preflight(overrides: Partial<ExternalPreflight> = {}): ExternalPreflight {
  return {
    ok: true,
    provider: 'p',
    adapterId: 'a',
    role: 'proposal',
    connection: 'api',
    scopeHash: 's',
    contextHash: 'c',
    sendsRemaining: 1,
    costTier: 'free',
    packetHash: 'h',
    credential: { required: false, present: true, source: 'none' },
    checks: [],
    blockingReasons: [],
    ...overrides
  }
}

function readiness(overrides: Partial<OllamaReadiness> = {}): OllamaReadiness {
  return { reachable: true, modelPresent: true, models: ['llama3:latest'], detail: 'model llama3 present', baseUrl: 'http://127.0.0.1:11434', model: 'llama3', ...overrides }
}

describe('isSendEnabled (ADF-OLLAMA-FIRST-CLASS-ADAPTER-001 send-button gate)', () => {
  it('is disabled while busy or in-flight, regardless of preflight/readiness', () => {
    expect(isSendEnabled(preflight(), null, 'api', true, false)).toBe(false)
    expect(isSendEnabled(preflight(), null, 'api', false, true)).toBe(false)
  })

  it('is disabled when preflight has not passed', () => {
    expect(isSendEnabled(null, null, 'api', false, false)).toBe(false)
    expect(isSendEnabled(preflight({ ok: false }), null, 'api', false, false)).toBe(false)
  })

  it('non-local-http (e.g. Anthropic): enabled once preflight passes, readiness is irrelevant', () => {
    expect(isSendEnabled(preflight({ ok: true }), null, 'api', false, false)).toBe(true)
    expect(isSendEnabled(preflight({ ok: true }), readiness({ reachable: false }), 'api', false, false)).toBe(true)
  })

  it('local-http (Ollama): stays disabled with a passing preflight until readiness also passes', () => {
    expect(isSendEnabled(preflight({ ok: true }), null, 'local-http', false, false)).toBe(false)
    expect(isSendEnabled(preflight({ ok: true }), readiness({ reachable: false, modelPresent: false }), 'local-http', false, false)).toBe(false)
    expect(isSendEnabled(preflight({ ok: true }), readiness({ reachable: true, modelPresent: false }), 'local-http', false, false)).toBe(false)
    expect(isSendEnabled(preflight({ ok: true }), readiness({ reachable: false, modelPresent: true }), 'local-http', false, false)).toBe(false)
  })

  it('local-http (Ollama): enabled once both preflight and readiness pass', () => {
    expect(isSendEnabled(preflight({ ok: true }), readiness({ reachable: true, modelPresent: true }), 'local-http', false, false)).toBe(true)
  })

  it('an undefined connection (no Adapter selected yet) is treated like non-local-http: readiness never gates it', () => {
    expect(isSendEnabled(preflight({ ok: true }), null, undefined, false, false)).toBe(true)
  })
})
