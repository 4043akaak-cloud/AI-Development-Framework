/**
 * Independent review as a record, not a habit.
 *
 * The Charter has required an independent review for `Done` since the beginning, and the codebase
 * has never had a shape for one. Five reviews were run by hand on 2026-09-08/09 — assembling the
 * packet, dispatching, reproducing each finding, deciding, writing it into a Task by hand. What
 * broke was never the dispatch. It was everything either side of it.
 */

export type ReviewSeverity = 'P0' | 'P1' | 'P2' | 'P3'

/**
 * Whether the implementer could make the finding happen.
 *
 * A Review Artifact is untrusted input: the reviewer read code and reached a conclusion, and until
 * someone reproduces it that is a claim. All eleven findings on 2026-09-08 reproduced, which is a
 * result and not a reason to skip the step.
 */
export type ReproductionStatus = 'not-attempted' | 'reproduced' | 'not-reproduced'

/** What the implementer decided after reproducing. `deferred` needs a reason and a place it went. */
export type FindingDisposition = 'accepted' | 'deferred' | 'rejected'

export interface ReviewFinding {
  findingId: string
  severity: ReviewSeverity
  summary: string
  /** Where the reviewer says it is. Free text; reviewers cite differently. */
  evidence: string
  reproduction: ReproductionStatus
  /** Required once reproduction is settled. */
  disposition?: FindingDisposition
  /** Why, for `deferred` and `rejected`. An unexplained dismissal is how review becomes theatre. */
  dispositionReason?: string
}

/**
 * What the reviewer is given. Fixed at dispatch: a review of a moving target cannot be reconciled
 * with the thing that was reviewed.
 */
export interface ReviewPacket {
  packetId: string
  /** The Task whose acceptance criteria this review is against. */
  targetTaskId: string
  /** Commit range or working-tree marker the review covers. */
  revisionRange: string
  files: string[]
  /** The implementer's own claims. Naming them is what lets a reviewer disagree with one. */
  claims: string[]
  questions: string[]
  createdAt: string
}

/**
 * A reviewer that stops halfway is not a reviewer that found nothing.
 *
 * Both reviews dispatched on 2026-09-09 ended early — one blocked on stdin for two hours, one hit a
 * usage limit mid-file — and in each case the run exited zero. Without a state for it, "no findings
 * reported" and "the reviewer never finished" look identical from the outside.
 */
export type ReviewCompletion = 'complete' | 'incomplete' | 'not-run'

export interface ReviewRun {
  reviewId: string
  packet: ReviewPacket
  /** Model or agent identity. Compared against the implementer, never assumed to differ. */
  reviewer: string
  implementer: string
  completion: ReviewCompletion
  /** Why it stopped, when `incomplete`. */
  incompleteReason?: string
  findings: ReviewFinding[]
  reviewedAt?: string
}
