import { describe, expect, it } from 'vitest'
import { CredentialShapedTextError, assertNoCredentialShapedText } from '../src/shared/secretSentinel'
import { submissionScanFields, type ParticipantSubmission } from '../src/shared/participantTypes'
import { ResultEnvelopeRejectedError, validateResultEnvelope, type AdapterResultEnvelope } from '../src/main/jobLoop/resultEnvelope'
import { validateImplementationCandidate } from '../src/main/frontdoor/candidateArtifact'
import { hashJson } from '../src/main/jobLoop/hash'

/**
 * The list of places where text ADF did not author becomes something ADF stores or shows the Owner.
 *
 * This file is the boundary inventory, not just a set of cases. The defect it exists to prevent was
 * not a bad check — it was a boundary nobody had written down, so nobody noticed it was unguarded.
 * A new boundary that is not added here has no evidence that it holds.
 */

const CREDENTIAL = 'sk-abcdefghijklmnop'

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
    content: 'ordinary proposal text',
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

function submission(overrides: Partial<ParticipantSubmission> = {}): ParticipantSubmission {
  return {
    submissionId: 'submission-1',
    assignmentId: 'assignment-1',
    participantId: 'participant-a',
    participantRole: 'specialist',
    runId: 'run-1',
    requestId: 'request-1',
    nodeId: 'proposal',
    requestHash: 'a'.repeat(64),
    planHash: 'b'.repeat(64),
    targetHash: 'c'.repeat(64),
    assignmentHash: 'd'.repeat(64),
    status: 'submitted',
    summary: 'ordinary summary',
    content: 'ordinary content',
    verification: [{ name: 'scope-boundary', status: 'pass' }],
    risks: [],
    createdAt: '2026-09-08T00:00:00.000Z',
    ...overrides
  } as ParticipantSubmission
}

const expectedEnvelope = { taskId: 'task-1', jobId: 'job-1', inputHash: 'input-hash' }

describe('external text boundaries', () => {
  describe('Adapter answer → Result Envelope (relay.ts:466 / :292, runtime.ts, liveArtifacts.ts)', () => {
    it('accepts ordinary text', () => {
      expect(() => validateResultEnvelope(envelope(), expectedEnvelope)).not.toThrow()
    })

    it('rejects a credential in every Adapter-controlled field', () => {
      const cases: Array<Partial<AdapterResultEnvelope>> = [
        { content: CREDENTIAL },
        { summary: CREDENTIAL },
        { terminationReason: CREDENTIAL },
        { nextOwnerDecision: CREDENTIAL },
        { risks: [CREDENTIAL] },
        { verification: [{ name: CREDENTIAL, status: 'pass' }] },
        { verification: [{ name: 'x', status: 'fail', reason: CREDENTIAL }] },
        { artifact: { note: CREDENTIAL } }
      ]
      for (const override of cases) {
        expect(() => validateResultEnvelope(envelope(override), expectedEnvelope), JSON.stringify(override)).toThrow(ResultEnvelopeRejectedError)
      }
    })
  })

  describe('Participant submission (participantMcpServer.ts write / participantEvidence.ts adopt)', () => {
    it('scans the same fields at both ends', () => {
      // Both ends call submissionScanFields, so a divergence here is what this asserts against.
      const fields = submissionScanFields(submission())
      expect(Object.keys(fields).sort()).toEqual(['content', 'summary', 'verification[0].name'])
    })

    it('accepts ordinary text', () => {
      expect(() => assertNoCredentialShapedText('participant submission', submissionScanFields(submission()))).not.toThrow()
    })

    it('rejects a credential in every participant-controlled field', () => {
      const cases: Array<Partial<ParticipantSubmission>> = [
        { summary: CREDENTIAL },
        { content: CREDENTIAL },
        { risks: [CREDENTIAL] },
        { verification: [{ name: CREDENTIAL, status: 'pass' }] },
        { verification: [{ name: 'x', status: 'fail', reason: CREDENTIAL }] }
      ]
      for (const override of cases) {
        expect(
          () => assertNoCredentialShapedText('participant submission', submissionScanFields(submission(override))),
          JSON.stringify(override)
        ).toThrow(CredentialShapedTextError)
      }
    })
  })

  describe('Work Plane candidate (candidateArtifact.ts)', () => {
    it('rejects a credential in candidate file content', () => {
      const files = [{ relativePath: 'a.txt', content: CREDENTIAL, contentHash: hashJson(CREDENTIAL) }]
      const candidate = { kind: 'candidate-file-set', baseSnapshotHash: 'base', files, candidateHash: '' }
      expect(() => validateImplementationCandidate(candidate, ['a.txt'])).toThrow(/secret sentinel/)
    })
  })

  describe('shared guard contract', () => {
    it('reports field and pattern names but never the matched value', () => {
      try {
        assertNoCredentialShapedText('source', { field: 'api_key: hunter2' })
        expect.unreachable('should have thrown')
      } catch (error) {
        const rejection = error as CredentialShapedTextError
        expect(rejection).toBeInstanceOf(CredentialShapedTextError)
        // Overlapping patterns both report; the contract is the shape of each entry, not its count.
        expect(rejection.fields).toContain('field (api-key-assignment)')
        expect(rejection.fields.every((entry) => /^field \([a-z-]+\)$/.test(entry))).toBe(true)
        expect(rejection.message).not.toContain('hunter2')
      }
    })

    it('treats a non-string as a caller bug rather than skipping it silently', () => {
      // The gap this closes: a value that is not a string used to fall out of the scan unnoticed.
      expect(() => assertNoCredentialShapedText('source', { field: { nested: CREDENTIAL } })).toThrow(CredentialShapedTextError)
    })

    it('ignores absent optional fields', () => {
      expect(() => assertNoCredentialShapedText('source', { a: undefined, b: null })).not.toThrow()
    })
  })
})
