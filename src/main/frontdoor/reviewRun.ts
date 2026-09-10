import { hashJson } from '../jobLoop/hash'
import type { FindingDisposition, ReviewFinding, ReviewOutcome, ReviewPacket, ReviewRun, ReviewSeverity } from '../../shared/reviewTypes'

/**
 * The checks that made the difference when reviews were run by hand, and the one that did not hold.
 *
 * Nothing here dispatches. Sending a packet to a provider needs a per-provider Owner approval that
 * already exists, and putting a send behind a convenience function is how that approval gets
 * skipped. This is the record and the arithmetic around it.
 */

export class ReviewRejectedError extends Error {
  readonly code = 'REVIEW_REJECTED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Review rejected: ${details.join('; ')}`)
    this.details = details
  }
}

export function buildReviewPacket(input: Omit<ReviewPacket, 'packetId'>): ReviewPacket {
  const errors: string[] = []
  if (!input.targetTaskId.trim()) errors.push('a review needs the Task it is reviewing')
  if (!input.revisionRange.trim()) errors.push('a review needs a fixed revision range')
  if (input.files.length === 0) errors.push('a review of no files is not a review')
  // Without stated claims a reviewer can only report what it happens to notice. Naming the claims is
  // what let Codex answer "this one is false" rather than "here are some thoughts".
  if (input.claims.length === 0) errors.push('state the claims the review is meant to test')
  if (errors.length) throw new ReviewRejectedError(errors)
  return { ...input, packetId: `review-packet-${hashJson(input).slice(0, 20)}` }
}

/**
 * Refuses a review whose reviewer is its implementer.
 *
 * The Charter requires the two to differ, and on 2026-09-09 they did not: Codex stopped at its usage
 * limit and Claude Code finished the work it was reviewing. That was the Owner's call and it was
 * recorded, but nothing in the code noticed. Now something does.
 */
export function assertIndependent(implementer: string, reviewer: string): void {
  const same = implementer.trim().toLowerCase() === reviewer.trim().toLowerCase()
  if (same) throw new ReviewRejectedError([`the reviewer and the implementer are both "${implementer}"`])
}

const BLOCKING: readonly ReviewSeverity[] = ['P0', 'P1']

export type { ReviewOutcome } from '../../shared/reviewTypes'

/**
 * Whether a review actually clears the Task, rather than whether one happened.
 *
 * Every rule here is a step that was performed by hand five times and could have been skipped
 * quietly on the sixth.
 */
export function assessReview(run: ReviewRun): ReviewOutcome {
  const blockers: string[] = []

  if (run.completion === 'not-run') blockers.push('the review has not been run')
  // An early exit is not a clean bill of health, and both runs that ended early exited zero.
  if (run.completion === 'incomplete') blockers.push(`the reviewer stopped before finishing${run.incompleteReason ? `: ${run.incompleteReason}` : ''}`)

  try {
    assertIndependent(run.implementer, run.reviewer)
  } catch (error) {
    blockers.push((error as ReviewRejectedError).details.join('; '))
  }

  const bySeverity: Record<ReviewSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const finding of run.findings) bySeverity[finding.severity] += 1

  const unreproduced = run.findings.filter((finding) => finding.reproduction === 'not-attempted').length
  if (unreproduced > 0) blockers.push(`${unreproduced} finding(s) have not been reproduced`)

  const undecided = run.findings.filter((finding) => finding.reproduction === 'reproduced' && !finding.disposition).length
  if (undecided > 0) blockers.push(`${undecided} reproduced finding(s) have no disposition`)

  const openBlocking = run.findings.filter(
    (finding) => BLOCKING.includes(finding.severity) && finding.reproduction === 'reproduced' && finding.disposition !== 'accepted' && finding.disposition !== 'rejected'
  )
  if (openBlocking.length > 0) blockers.push(`${openBlocking.length} reproduced P0/P1 finding(s) are neither fixed nor rejected`)

  // A dismissal without a reason is indistinguishable from not having read it.
  const unexplained = run.findings.filter((finding) => (finding.disposition === 'deferred' || finding.disposition === 'rejected') && !finding.dispositionReason?.trim())
  if (unexplained.length > 0) blockers.push(`${unexplained.length} deferred or rejected finding(s) give no reason`)

  return { doneEligible: blockers.length === 0, blockers, bySeverity, unreproduced, undecided }
}

/** Disposition counts, for a Task record that says what happened to the findings rather than how many there were. */
export function dispositionCounts(run: ReviewRun): Record<FindingDisposition | 'undecided', number> {
  const counts = { accepted: 0, deferred: 0, rejected: 0, undecided: 0 }
  for (const finding of run.findings) {
    if (finding.disposition) counts[finding.disposition] += 1
    else counts.undecided += 1
  }
  return counts
}

export function formatReviewOutcome(run: ReviewRun, outcome: ReviewOutcome): string {
  const counts = dispositionCounts(run)
  const lines = [
    `review ${run.reviewId} — ${run.packet.targetTaskId} @ ${run.packet.revisionRange}`,
    `  implementer: ${run.implementer}   reviewer: ${run.reviewer}   completion: ${run.completion}`,
    `  findings: ${run.findings.length} (P0 ${outcome.bySeverity.P0}, P1 ${outcome.bySeverity.P1}, P2 ${outcome.bySeverity.P2}, P3 ${outcome.bySeverity.P3})`,
    `  disposition: accepted ${counts.accepted}, deferred ${counts.deferred}, rejected ${counts.rejected}, undecided ${counts.undecided}`
  ]
  if (outcome.doneEligible) lines.push('  Done-eligible on this review.')
  else {
    lines.push('  NOT Done-eligible:')
    for (const blocker of outcome.blockers) lines.push(`    - ${blocker}`)
  }
  lines.push('', 'The review clears the review. Owner completion approval is separate.')
  return lines.join('\n')
}
