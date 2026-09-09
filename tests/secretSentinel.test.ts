import { describe, expect, it } from 'vitest'
import { containsSecret, detectSecrets, maskSecrets } from '../src/shared/secretSentinel'
import { ResultEnvelopeRejectedError, validateResultEnvelope, type AdapterResultEnvelope } from '../src/main/jobLoop/resultEnvelope'

/** The two regexes that lived inline before this module, kept here as the regression baseline. */
const PREVIOUS_CANDIDATE_SENTINEL = /(ANTHROPIC_API_KEY|OPENAI_API_KEY|api[_-]?key\s*[:=]|sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/i
const previousMask = (value: string): string =>
  value.replace(/(sk-|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,}]+/gi, '$1=<redacted>')

const credentialShaped = [
  'ANTHROPIC_API_KEY',
  'anthropic_api_key',
  'export OPENAI_API_KEY=abc',
  'api_key: hunter2',
  'API_KEY: hunter2',
  'api-key=hunter2',
  'sk-abcdefghijklmnop',
  // Regression guard: the sentinel this replaced applied `/i` across its whole alternation.
  'SK-abcdefghijklmnop',
  'Sk-AbCdEfGhIjKlMnOp',
  'Authorization: Bearer abcdefghijklmnop',
  'authorization: bearer abcdefghijklmnop',
  'token: abcdef',
  'TOKEN=abcdef',
  'password=letmein',
  'secret = s3cr3t'
]

const innocuous = [
  'Owner approved the dispatch',
  'scope-boundary: pass',
  '提案1: 承認済みScopeとhashを検証したうえで最小の実装方針を出す。',
  'the bearer of this message',
  'sk-short',
  'prior-turn-reference: pass',
  'threads/thread-9e3c20695561eabb/results/turn-0-d7ccad549e7f.json'
]

function envelope(overrides: Partial<AdapterResultEnvelope> = {}): AdapterResultEnvelope {
  return {
    resultId: 'result-1',
    jobId: 'job-1',
    taskId: 'task-1',
    adapterId: 'fake-ai-a',
    role: 'proposal',
    inputHash: 'input-hash',
    scopeHash: 'scope-hash',
    contextHash: 'context-hash',
    status: 'success',
    content: '提案1: 最小の実装方針を出す。',
    summary: 'Fake提案 1 件目',
    artifact: {},
    verification: [{ name: 'scope-boundary', status: 'pass' }],
    risks: [],
    ownerDecisionRequired: true,
    nextOwnerDecision: 'このTurnを確認する',
    createdAt: '2026-09-08T00:00:00.000Z',
    durationMs: 1,
    terminationReason: 'completed',
    ...overrides
  }
}

const expected = { taskId: 'task-1', jobId: 'job-1', inputHash: 'input-hash' }

describe('secretSentinel', () => {
  it('detects credential-shaped text', () => {
    for (const value of credentialShaped) {
      expect(containsSecret(value), value).toBe(true)
    }
  })

  it('leaves ordinary ADF text alone', () => {
    for (const value of innocuous) {
      expect(containsSecret(value), value).toBe(false)
    }
  })

  it('reports pattern names without echoing the matched text', () => {
    const names = detectSecrets('api_key: hunter2')
    expect(names).toContain('api-key-assignment')
    expect(names.join(' ')).not.toContain('hunter2')
  })

  /**
   * The first version of this test only fed it lower-case samples, so it asserted the superset
   * property while never exercising the one axis where the union had actually narrowed: the old
   * sentinel carried `/i` across its whole alternation. Case variants are generated here rather
   * than hand-listed so the same blind spot cannot come back.
   */
  it('is a superset of the sentinel it replaced, in every case variant', () => {
    const corpus = [...credentialShaped, ...innocuous].flatMap((value) => [value, value.toUpperCase(), value.toLowerCase()])
    const narrowed = corpus.filter((value) => PREVIOUS_CANDIDATE_SENTINEL.test(value) && !containsSecret(value))
    expect(narrowed).toEqual([])
  })

  /**
   * The inline mask only caught assignments, so a bare `sk-…` or `Bearer …` survived it. That was
   * cosmetic while masking only fed the screen; `safeErrorText` now leans on it to keep credentials
   * out of the Ledger, so the property that matters is that nothing credential-shaped survives.
   */
  it('leaves no credential value behind', () => {
    // The shape can survive — `api_key=<redacted>` still looks like an assignment — but the value
    // must not. These are the payloads the old assignment-only mask let through untouched.
    const payloads = ['sk-abcdefghijklmnop', 'SK-abcdefghijklmnop', 'Bearer abcdefghijklmnop', 'ANTHROPIC_API_KEY', 'hunter2', 'letmein', 's3cr3t']
    for (const value of credentialShaped) {
      const masked = maskSecrets(value)
      for (const payload of payloads) {
        if (value.includes(payload)) expect(masked, `${value} → ${masked}`).not.toContain(payload)
      }
    }
  })

  it('redacts at least as much as the inlined projection mask did', () => {
    for (const value of [...credentialShaped, ...innocuous, 'a token: x and secret: y']) {
      const before = previousMask(value)
      const after = maskSecrets(value)
      // Everything the old mask removed is still gone; the new one may remove more.
      if (before !== value) expect(after, value).not.toBe(value)
    }
  })

  it('still leaves ordinary text untouched', () => {
    for (const value of innocuous) {
      expect(maskSecrets(value), value).toBe(value)
    }
  })

  it('does not carry regex state between calls', () => {
    const value = 'token: one token: two'
    expect(maskSecrets(value)).toBe(maskSecrets(value))
    expect(containsSecret('sk-abcdefghijklmnop')).toBe(true)
    expect(containsSecret('sk-abcdefghijklmnop')).toBe(true)
  })
})

describe('validateResultEnvelope credential guard', () => {
  it('accepts an ordinary Result', () => {
    expect(() => validateResultEnvelope(envelope(), expected)).not.toThrow()
  })

  it('rejects a Result whose content carries a credential', () => {
    expect(() => validateResultEnvelope(envelope({ content: 'export ANTHROPIC_API_KEY=sk-abcdefghijklmnop' }), expected)).toThrow(ResultEnvelopeRejectedError)
  })

  it('rejects credentials in summary, risks, verification and artifact', () => {
    expect(() => validateResultEnvelope(envelope({ summary: 'api_key: leaked' }), expected)).toThrow(ResultEnvelopeRejectedError)
    expect(() => validateResultEnvelope(envelope({ risks: ['token: abcdef'] }), expected)).toThrow(ResultEnvelopeRejectedError)
    expect(() => validateResultEnvelope(envelope({ verification: [{ name: 'x', status: 'fail', reason: 'password=letmein' }] }), expected)).toThrow(ResultEnvelopeRejectedError)
    expect(() => validateResultEnvelope(envelope({ artifact: { note: 'Bearer abcdefghijklmnop' } }), expected)).toThrow(ResultEnvelopeRejectedError)
    expect(() => validateResultEnvelope(envelope({ terminationReason: 'sk-abcdefghijklmnop' }), expected)).toThrow(ResultEnvelopeRejectedError)
    expect(() => validateResultEnvelope(envelope({ nextOwnerDecision: 'token: abcdef' }), expected)).toThrow(ResultEnvelopeRejectedError)
  })

  /** `relay.ts:524` fills the whole entry from `answer.verification`, so `name` is Adapter-controlled. */
  it('rejects a credential hidden in a verification entry name', () => {
    expect(() => validateResultEnvelope(envelope({ verification: [{ name: 'token: hunter2', status: 'pass' }] }), expected)).toThrow(ResultEnvelopeRejectedError)
  })

  it('rejects an envelope whose scanned fields are not strings, instead of silently skipping them', () => {
    const nonString = envelope()
    ;(nonString as unknown as { summary: unknown }).summary = { leaked: 'sk-abcdefghijklmnop' }
    expect(() => validateResultEnvelope(nonString, expected)).toThrow(ResultEnvelopeRejectedError)

    const malformedEntry = envelope()
    ;(malformedEntry as unknown as { verification: unknown }).verification = [{ status: 'pass' }]
    expect(() => validateResultEnvelope(malformedEntry, expected)).toThrow(ResultEnvelopeRejectedError)
  })

  it('rejects a credential quoted back through a dependency Result', () => {
    const withDependency = envelope({
      dependencyResults: [{ runId: 'run-1', nodeId: 'proposal', resultRef: 'threads/t/results/turn-0.json', resultHash: 'hash', status: 'success', content: 'sk-abcdefghijklmnop' }]
    })
    expect(() => validateResultEnvelope(withDependency, expected)).toThrow(ResultEnvelopeRejectedError)
  })

  it('names the field and pattern but never the value', () => {
    try {
      validateResultEnvelope(envelope({ content: 'api_key: hunter2' }), expected)
      expect.unreachable('the envelope should have been rejected')
    } catch (error) {
      const rejection = error as ResultEnvelopeRejectedError
      expect(rejection).toBeInstanceOf(ResultEnvelopeRejectedError)
      expect(rejection.message).toContain('content')
      expect(rejection.message).toContain('api-key-assignment')
      expect(rejection.message).not.toContain('hunter2')
    }
  })

  it('still reports shape errors first, so a malformed envelope is never scanned', () => {
    const malformed = envelope({ content: 'api_key: hunter2' })
    ;(malformed as { risks: unknown }).risks = 'not-an-array'
    try {
      validateResultEnvelope(malformed, expected)
      expect.unreachable('the envelope should have been rejected')
    } catch (error) {
      expect((error as ResultEnvelopeRejectedError).message).toContain('verification or risks is not an array')
      expect((error as ResultEnvelopeRejectedError).message).not.toContain('credential-shaped')
    }
  })
})
