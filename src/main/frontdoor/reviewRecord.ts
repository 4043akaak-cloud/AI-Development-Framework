import path from 'node:path'
import type { FrontdoorLedgerEvent } from '../../shared/frontdoorTypes'
import type { InspectedReviewRun, RecordedReviewRun, ReviewFinding, ReviewPacket, ReviewRun } from '../../shared/reviewTypes'
import { hashJson } from '../jobLoop/hash'
import { readJson, writeJsonExclusive } from '../jobLoop/ledger'
import { assessReview } from './reviewRun'
import { readRunEvents, recordRunEvent, runDirectory } from './ledger'
import { assertNoSymlinkComponents, assertRuntimeRootSafe, safeRuntimePath } from './pathIntegrity'

export type { RecordedReviewRun } from '../../shared/reviewTypes'

export class ReviewRecordRejectedError extends Error {
  readonly code = 'REVIEW_RECORD_REJECTED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Review record rejected: ${details.join('; ')}`)
    this.details = details
  }
}

/** `frontdoor-runs/<runId>/reviews/<reviewId>.json`, matching the `work-plane/` artifact layout. */
export function reviewRecordRef(runId: string, reviewId: string): string {
  return path.posix.join('frontdoor-runs', runId, 'reviews', `${reviewId}.json`)
}

/**
 * Identifies the reviewed state. A review of a Run is only meaningful against a particular
 * Plan and Result set: once the Run moves on, the review describes something that no longer exists,
 * and the hash is what lets a reader notice that instead of trusting a stale verdict.
 */
export function reviewTargetHash(run: { runId: string; requestHash: string; planHash: string; nodes: readonly { node: { nodeId: string }; resultHash?: string }[] }): string {
  return hashJson({
    runId: run.runId,
    requestHash: run.requestHash,
    planHash: run.planHash,
    results: run.nodes.map((record) => ({ nodeId: record.node.nodeId, resultHash: record.resultHash ?? null })).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  })
}

function assertFindingShape(finding: unknown, index: number, errors: string[]): void {
  const entry = finding as Partial<ReviewFinding>
  if (!entry || typeof entry !== 'object') return void errors.push(`findings[${index}] is not an object`)
  if (typeof entry.findingId !== 'string' || !entry.findingId.trim()) errors.push(`findings[${index}].findingId is required`)
  if (!['P0', 'P1', 'P2', 'P3'].includes(entry.severity as string)) errors.push(`findings[${index}].severity is invalid`)
  if (typeof entry.summary !== 'string' || !entry.summary.trim()) errors.push(`findings[${index}].summary is required`)
  if (typeof entry.evidence !== 'string') errors.push(`findings[${index}].evidence must be a string`)
  if (!['not-attempted', 'reproduced', 'not-reproduced'].includes(entry.reproduction as string)) errors.push(`findings[${index}].reproduction is invalid`)
  if (entry.disposition !== undefined && !['accepted', 'deferred', 'rejected'].includes(entry.disposition)) errors.push(`findings[${index}].disposition is invalid`)
}

/**
 * The review arrives from outside ADF — a reviewer AI's output, pasted or piped in — so it is
 * checked as untrusted input rather than trusted because it is well-intentioned. `assessReview`
 * reasons about severities and dispositions; it cannot do that on a `severity` that is not one.
 */
export function validateReviewRun(value: unknown): ReviewRun {
  const errors: string[] = []
  const review = value as Partial<ReviewRun>
  if (!review || typeof review !== 'object') throw new ReviewRecordRejectedError(['the review is not an object'])
  if (typeof review.reviewId !== 'string' || !review.reviewId.trim()) errors.push('reviewId is required')
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim()) errors.push('reviewer is required')
  if (typeof review.implementer !== 'string' || !review.implementer.trim()) errors.push('implementer is required')
  if (!['complete', 'incomplete', 'not-run'].includes(review.completion as string)) errors.push('completion is invalid')
  const packet = review.packet as Partial<ReviewPacket> | undefined
  if (!packet || typeof packet !== 'object') errors.push('packet is required')
  else {
    if (typeof packet.packetId !== 'string' || !packet.packetId.trim()) errors.push('packet.packetId is required')
    if (typeof packet.targetTaskId !== 'string' || !packet.targetTaskId.trim()) errors.push('packet.targetTaskId is required')
    if (typeof packet.revisionRange !== 'string' || !packet.revisionRange.trim()) errors.push('packet.revisionRange is required')
    if (!Array.isArray(packet.files)) errors.push('packet.files must be an array')
    if (!Array.isArray(packet.claims)) errors.push('packet.claims must be an array')
  }
  if (!Array.isArray(review.findings)) errors.push('findings must be an array')
  else review.findings.forEach((finding, index) => assertFindingShape(finding, index, errors))
  if (errors.length) throw new ReviewRecordRejectedError(errors)
  return review as ReviewRun
}

/**
 * Records one review against one Run.
 *
 * `assessReview` runs here and its verdict is stored alongside the review, so the Ledger carries
 * ADF's own reading rather than only the reviewer's text. A review whose findings are unreproduced,
 * or whose reviewer is the implementer, is still recorded — the verdict says so. Refusing to record
 * it would lose the only evidence that the review happened and fell short, which is exactly what
 * the prose-in-a-Task-header approach already did.
 *
 * The one thing refused outright is recording a review of a state the Run is no longer in: a stale
 * verdict presented as current is worse than no verdict.
 */
export async function recordReviewRun(runtimeRoot: string, run: { runId: string; requestId: string; requestHash: string; planHash: string; nodes: readonly { node: { nodeId: string }; resultHash?: string }[] }, review: ReviewRun, recordedBy: string, now: string): Promise<RecordedReviewRun> {
  const validated = validateReviewRun(review)
  if (!recordedBy.trim()) throw new ReviewRecordRejectedError(['recordedBy is required'])
  const record: RecordedReviewRun = {
    reviewId: validated.reviewId,
    runId: run.runId,
    requestId: run.requestId,
    targetHash: reviewTargetHash(run),
    review: validated,
    outcome: assessReview(validated),
    recordedAt: now,
    recordedBy: recordedBy.trim().slice(0, 120)
  }
  const ref = reviewRecordRef(run.runId, validated.reviewId)
  // `safeRuntimePath` resolves an existing file, so it cannot vet one that is about to be created.
  // The root and the directory are checked here instead, which is the same boundary applied one
  // step earlier.
  const root = await assertRuntimeRootSafe(runtimeRoot)
  const directory = path.join(runDirectory(root, run.runId), 'reviews')
  await assertNoSymlinkComponents(root, directory)
  const file = path.join(directory, `${validated.reviewId}.json`)
  try {
    // Exclusive: a review is evidence of a moment. Replacing one in place would let a later, kinder
    // reading quietly overwrite the one that found something.
    await writeJsonExclusive(file, record)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ReviewRecordRejectedError([`a review with this id is already recorded: ${validated.reviewId}`])
    throw error
  }
  await recordRunEvent(runtimeRoot, run.runId, 'frontdoor.review-run-recorded', {
    reviewId: record.reviewId,
    reviewRef: ref,
    reviewHash: hashJson(record),
    targetHash: record.targetHash,
    reviewer: validated.reviewer,
    implementer: validated.implementer,
    completion: validated.completion,
    doneEligible: record.outcome.doneEligible,
    blockers: record.outcome.blockers,
    recordedBy: record.recordedBy
  }, now)
  return record
}

function reviewEvents(events: readonly FrontdoorLedgerEvent[]): FrontdoorLedgerEvent[] {
  return events.filter((event) => event.type === 'frontdoor.review-run-recorded')
}

/**
 * Every review recorded against this Run, re-read from disk and re-hashed.
 *
 * The stored record is compared against the hash the Ledger captured when it was written. A review
 * that no longer matches is surfaced as tampered rather than dropped: silently omitting it would
 * turn an altered review into an absent one.
 */
export async function listReviewRuns(runtimeRoot: string, runId: string): Promise<InspectedReviewRun[]> {
  const events = await readRunEvents(runtimeRoot, runId)
  const results: InspectedReviewRun[] = []
  for (const event of reviewEvents(events)) {
    const ref = event.payload.reviewRef
    if (typeof ref !== 'string') continue
    const record = await readJson<RecordedReviewRun>(await safeRuntimePath(runtimeRoot, ref))
    results.push({ ...record, tampered: hashJson(record) !== event.payload.reviewHash, stale: false })
  }
  return results
}

/**
 * The reviews that still describe the Run as it is now, with the current target hash applied.
 *
 * Separated from reading them because "a review exists" and "a review of this state exists" are
 * different questions, and only the second one can clear a Task.
 */
export function currentReviews(reviews: readonly InspectedReviewRun[], targetHash: string): InspectedReviewRun[] {
  return reviews.map((review) => ({ ...review, stale: review.targetHash !== targetHash }))
}

/** Whether any recorded review clears this Run's current state. Owner completion approval is separate. */
export function reviewClearance(reviews: readonly InspectedReviewRun[], targetHash: string): { cleared: boolean; blockers: string[] } {
  const applicable = currentReviews(reviews, targetHash).filter((review) => !review.stale && !review.tampered)
  if (applicable.length === 0) return { cleared: false, blockers: ['no independent review has been recorded against the current state of this Run'] }
  const clearing = applicable.find((review) => review.outcome.doneEligible)
  if (clearing) return { cleared: true, blockers: [] }
  return { cleared: false, blockers: applicable.flatMap((review) => review.outcome.blockers.map((blocker) => `${review.reviewId}: ${blocker}`)) }
}
