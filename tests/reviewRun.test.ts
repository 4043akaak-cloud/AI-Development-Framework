import { describe, expect, it } from 'vitest'
import { ReviewRejectedError, assertIndependent, assessReview, buildReviewPacket, dispositionCounts, formatReviewOutcome } from '../src/main/frontdoor/reviewRun'
import type { ReviewFinding, ReviewRun } from '../src/shared/reviewTypes'

const packet = buildReviewPacket({
  targetTaskId: 'ADF-RESULT-SECRET-GUARD-001',
  revisionRange: '8669fa1',
  files: ['src/shared/secretSentinel.ts'],
  claims: ['統合後パターンは統合前の和集合以上である'],
  questions: ['塞げていない受信経路は残っていないか'],
  createdAt: '2026-09-09T00:00:00.000Z'
})

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    findingId: 'P1-1',
    severity: 'P1',
    summary: 'sk-credential に i フラグが無い',
    evidence: 'src/shared/secretSentinel.ts:28',
    reproduction: 'reproduced',
    disposition: 'accepted',
    ...overrides
  }
}

function run(overrides: Partial<ReviewRun> = {}): ReviewRun {
  return {
    reviewId: 'review-1',
    packet,
    reviewer: 'Codex',
    implementer: 'Claude Code',
    completion: 'complete',
    findings: [finding()],
    reviewedAt: '2026-09-09T01:00:00.000Z',
    ...overrides
  }
}

describe('buildReviewPacket', () => {
  it('refuses a packet with nothing to review', () => {
    expect(() => buildReviewPacket({ ...packet, files: [] })).toThrow(ReviewRejectedError)
  })

  /**
   * Naming the claims is what let the reviewer answer "this one is false" instead of offering
   * general impressions. Two of the three P1s on 2026-09-08 were exactly that.
   */
  it('refuses a packet that states no claims', () => {
    expect(() => buildReviewPacket({ ...packet, claims: [] })).toThrow(/state the claims/)
  })

  it('refuses a review of a moving target', () => {
    expect(() => buildReviewPacket({ ...packet, revisionRange: '  ' })).toThrow(/fixed revision range/)
  })

  it('is stable for the same inputs and distinct for different ones', () => {
    expect(buildReviewPacket({ ...packet, packetId: undefined } as never).packetId).toBe(packet.packetId)
    expect(buildReviewPacket({ ...packet, revisionRange: '9ee1c0b' }).packetId).not.toBe(packet.packetId)
  })
})

describe('assertIndependent', () => {
  /** 2026-09-09: Codex hit its usage limit and Claude Code finished the work it was reviewing. */
  it('refuses a reviewer who is the implementer', () => {
    expect(() => assertIndependent('Claude Code', 'Claude Code')).toThrow(ReviewRejectedError)
    expect(() => assertIndependent('Claude Code', 'claude code')).toThrow(ReviewRejectedError)
  })

  it('accepts genuinely different agents', () => {
    expect(() => assertIndependent('Claude Code', 'Codex')).not.toThrow()
  })
})

describe('assessReview', () => {
  it('clears a review where every finding was reproduced and settled', () => {
    const outcome = assessReview(run())
    expect(outcome.doneEligible).toBe(true)
    expect(outcome.blockers).toEqual([])
  })

  /**
   * Both reviews dispatched on 2026-09-09 ended early and both exited zero — one blocked on stdin,
   * one hit a usage limit. Without this, "reported nothing" and "never finished" are the same shape.
   */
  it('does not clear a review that stopped partway, however clean it looks', () => {
    const outcome = assessReview(run({ completion: 'incomplete', incompleteReason: 'usage limit', findings: [] }))
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('usage limit')
  })

  it('does not clear a review that never ran', () => {
    expect(assessReview(run({ completion: 'not-run', findings: [] })).doneEligible).toBe(false)
  })

  it('does not clear a review the implementer gave itself', () => {
    const outcome = assessReview(run({ reviewer: 'Claude Code' }))
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('Claude Code')
  })

  /** A Review Artifact is untrusted until someone makes the finding happen. */
  it('does not clear findings nobody tried to reproduce', () => {
    const outcome = assessReview(run({ findings: [finding({ reproduction: 'not-attempted', disposition: undefined })] }))
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.unreproduced).toBe(1)
  })

  it('does not clear a reproduced finding nobody decided about', () => {
    const outcome = assessReview(run({ findings: [finding({ disposition: undefined })] }))
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.undecided).toBe(1)
  })

  /** Dismissing a finding without saying why is indistinguishable from not reading it. */
  it('does not clear a dismissal with no reason', () => {
    expect(assessReview(run({ findings: [finding({ disposition: 'rejected' })] })).doneEligible).toBe(false)
    expect(assessReview(run({ findings: [finding({ disposition: 'rejected', dispositionReason: '前提が異なる' })] })).doneEligible).toBe(true)
  })

  it('lets a finding that did not reproduce pass without a disposition', () => {
    expect(assessReview(run({ findings: [finding({ reproduction: 'not-reproduced', disposition: undefined })] })).doneEligible).toBe(true)
  })

  it('counts severities without letting P2 and P3 block', () => {
    const outcome = assessReview(run({ findings: [finding({ severity: 'P2' }), finding({ findingId: 'P3-1', severity: 'P3' })] }))
    expect(outcome.bySeverity).toEqual({ P0: 0, P1: 0, P2: 1, P3: 1 })
    expect(outcome.doneEligible).toBe(true)
  })

  it('blocks on a reproduced P0 that was only deferred', () => {
    const outcome = assessReview(run({ findings: [finding({ severity: 'P0', disposition: 'deferred', dispositionReason: '別Taskへ' })] }))
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('neither fixed nor rejected')
  })
})

describe('reporting', () => {
  it('counts what happened to the findings, not just how many there were', () => {
    expect(dispositionCounts(run({ findings: [finding(), finding({ findingId: 'x', disposition: undefined })] }))).toEqual({
      accepted: 1, deferred: 0, rejected: 0, undecided: 1
    })
  })

  it('says why a review did not clear', () => {
    const incomplete = run({ completion: 'incomplete', incompleteReason: 'usage limit', findings: [] })
    const text = formatReviewOutcome(incomplete, assessReview(incomplete))
    expect(text).toContain('NOT Done-eligible')
    expect(text).toContain('usage limit')
  })

  it('never implies the review is the Owner’s approval', () => {
    const clean = run()
    expect(formatReviewOutcome(clean, assessReview(clean))).toContain('Owner completion approval is separate')
  })
})

/**
 * The five reviews actually run on 2026-09-08/09, replayed through the model.
 *
 * Every rule in `assessReview` came from one of these going wrong, so this is the check that the
 * rules describe what happened rather than what would have been convenient.
 */
describe('the reviews this model was built from', () => {
  const at = (targetTaskId: string, revisionRange: string, files: string[], claims: string[]) =>
    buildReviewPacket({ targetTaskId, revisionRange, files, claims, questions: [], createdAt: '2026-09-09T00:00:00.000Z' })

  /**
   * The model disagreed with the first draft of this test, and the model was right. All three P1s
   * reproduced, but P1-3 was deferred as out of scope — and the Task was in fact held at Verifying
   * rather than moved to Done for exactly that reason. A deferred P1 does not clear a review.
   */
  it('does not clear the first review, because a reproduced P1 was only deferred', () => {
    const outcome = assessReview({
      reviewId: 'review-2026-09-08-1',
      packet: at('ADF-RESULT-SECRET-GUARD-001', '8669fa1', ['src/shared/secretSentinel.ts'], ['統合後パターンは統合前の和集合以上である']),
      reviewer: 'Codex',
      implementer: 'Claude Code',
      completion: 'complete',
      findings: [
        finding({ findingId: 'P1-1', summary: 'sk-credential の i フラグ欠落', reproduction: 'reproduced', disposition: 'accepted' }),
        finding({ findingId: 'P1-2', summary: 'verification[].name 未走査', reproduction: 'reproduced', disposition: 'accepted' }),
        finding({ findingId: 'P1-3', summary: 'participant 経路が未ガード', reproduction: 'reproduced', disposition: 'deferred', dispositionReason: '本Task の In scope 外のため別Taskへ' })
      ]
    })
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('neither fixed nor rejected')
    expect(outcome.bySeverity.P1).toBe(3)
  })

  it('clears it once the deferred P1 is closed by its own Task', () => {
    const outcome = assessReview({
      reviewId: 'review-2026-09-08-1b',
      packet: at('ADF-RESULT-SECRET-GUARD-001', '8669fa1', ['src/shared/secretSentinel.ts'], ['統合後パターンは統合前の和集合以上である']),
      reviewer: 'Codex',
      implementer: 'Claude Code',
      completion: 'complete',
      findings: [
        finding({ findingId: 'P1-1', reproduction: 'reproduced', disposition: 'accepted' }),
        finding({ findingId: 'P1-2', reproduction: 'reproduced', disposition: 'accepted' }),
        finding({ findingId: 'P1-3', reproduction: 'reproduced', disposition: 'accepted' })
      ]
    })
    expect(outcome.doneEligible).toBe(true)
  })

  /** Two hours of nothing, exit code 0, no findings. Indistinguishable from a clean review. */
  it('refuses the review that blocked on stdin', () => {
    const outcome = assessReview({
      reviewId: 'review-2026-09-08-2',
      packet: at('ADF-EVIDENCE-INGRESS-GUARD-001', 'HEAD', ['src/main/frontdoor/participantEvidence.ts'], ['継ぎ目の選択は妥当である']),
      reviewer: 'Codex',
      implementer: 'Claude Code',
      completion: 'incomplete',
      incompleteReason: 'stdin 待ちでブロック。exit code は 0 だった',
      findings: []
    })
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('stdin')
  })

  it('refuses the review that hit a usage limit four entrances in', () => {
    const outcome = assessReview({
      reviewId: 'review-2026-09-09-1',
      packet: at('ADF-CODEX-SCOPED-WRITE-001', 'a568150', ['tests/externalTextBoundary.test.ts'], ['ガード削除でテストが落ちる']),
      reviewer: 'Codex',
      implementer: 'Claude Code',
      completion: 'incomplete',
      incompleteReason: '使用量上限。6入口中4到達',
      findings: []
    })
    expect(outcome.doneEligible).toBe(false)
  })

  /** The one the code would have caught if it had existed: nothing noticed at the time. */
  it('refuses the review Claude Code gave its own work', () => {
    const outcome = assessReview({
      reviewId: 'review-2026-09-09-2',
      packet: at('ADF-CODEX-SCOPED-WRITE-001', 'a568150', ['tests/externalTextBoundary.test.ts'], ['ガード削除でテストが落ちる']),
      reviewer: 'Claude Code',
      implementer: 'Claude Code',
      completion: 'complete',
      findings: []
    })
    expect(outcome.doneEligible).toBe(false)
    expect(outcome.blockers.join(' ')).toContain('Claude Code')
  })
})
