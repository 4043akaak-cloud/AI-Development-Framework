import type { AdapterRole, AdapterRunStatus } from '../../shared/jobLoopTypes'
import type { AdapterDependencyResult, AdapterQuestionDraft } from '../../shared/threadTypes'
import { CredentialShapedTextError, assertNoCredentialShapedText } from '../../shared/secretSentinel'
import { hashJson } from './hash'

export interface AdapterResultEnvelope {
  resultId: string
  jobId: string
  taskId: string
  adapterId: string
  role: AdapterRole
  inputHash: string
  scopeHash: string
  contextHash: string
  status: AdapterRunStatus
  /** Present on newly generated Results; absent in legacy envelopes for backward compatibility. */
  content?: string
  summary: string
  artifact: Record<string, unknown>
  verification: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks: string[]
  questions?: AdapterQuestionDraft[]
  dependencyResults?: AdapterDependencyResult[]
  orchestrationRunId?: string
  ownerDecisionRequired: boolean
  nextOwnerDecision: string
  createdAt: string
  durationMs: number
  terminationReason: string
}

export class ResultEnvelopeRejectedError extends Error {
  readonly code = 'RESULT_ENVELOPE_REJECTED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Result envelope rejected: ${details.join('; ')}`)
    this.details = details
  }
}

/**
 * The free-text fields an Adapter can fill. Identifiers and hashes are excluded: they are generated
 * by ADF, and scanning them only invites false positives.
 */
function secretScanTargets(envelope: AdapterResultEnvelope): Array<{ field: string; value: string }> {
  const targets: Array<{ field: string; value: string }> = []
  const push = (field: string, value: unknown): void => {
    if (typeof value === 'string' && value.length > 0) targets.push({ field, value })
  }
  push('content', envelope.content)
  push('summary', envelope.summary)
  push('terminationReason', envelope.terminationReason)
  push('nextOwnerDecision', envelope.nextOwnerDecision)
  envelope.risks.forEach((risk, index) => push(`risks[${index}]`, risk))
  envelope.verification.forEach((item, index) => {
    // `name` is as Adapter-controlled as `reason`: relay.ts fills the whole entry from
    // `answer.verification`, so scanning only the reason would leave half the entry open.
    push(`verification[${index}].name`, item.name)
    push(`verification[${index}].reason`, item.reason)
  })
  envelope.questions?.forEach((question, index) => push(`questions[${index}]`, JSON.stringify(question)))
  envelope.dependencyResults?.forEach((dependency, index) => push(`dependencyResults[${index}].content`, dependency.content))
  if (envelope.artifact && typeof envelope.artifact === 'object') push('artifact', JSON.stringify(envelope.artifact))
  return targets
}

/**
 * Fails closed on credential-shaped text before a Result is persisted or adopted.
 *
 * ADF already guards the two other directions: `assertPacketBoundary` on the way out to an Adapter,
 * and `containsSecret` on Work Plane candidates. The Adapter's own answer had no such check, so a
 * credential quoted back by an external AI would be masked on screen but written verbatim into
 * `events.jsonl` and the Evidence file. "The Adapter will not return credentials" is a contract with
 * an external system, not a guarantee, so the boundary is closed on ADF's side.
 *
 * The thrown message carries the field and the pattern name only. Recording the matched text would
 * reproduce the very value this check exists to keep out of the Ledger.
 */
function assertEnvelopeCarriesNoCredentials(envelope: AdapterResultEnvelope): void {
  const fields = Object.fromEntries(secretScanTargets(envelope).map((target) => [target.field, target.value]))
  try {
    assertNoCredentialShapedText('result', fields)
  } catch (error) {
    if (error instanceof CredentialShapedTextError) {
      // Re-thrown as the envelope's own rejection type so existing callers and tests keep working.
      throw new ResultEnvelopeRejectedError([error.message])
    }
    throw error
  }
}

export function validateResultEnvelope(envelope: AdapterResultEnvelope, expected: { taskId: string; jobId: string; inputHash: string }): void {
  const errors: string[] = []
  if (envelope.taskId !== expected.taskId) errors.push('taskId mismatch')
  if (envelope.jobId !== expected.jobId) errors.push('jobId mismatch')
  if (envelope.inputHash !== expected.inputHash) errors.push('inputHash mismatch')
  if (!envelope.adapterId || !envelope.role) errors.push('adapter identity is missing')
  if (!['success', 'partial', 'failed', 'invalid', 'timeout', 'cancelled'].includes(envelope.status)) errors.push('invalid result status')
  if (!envelope.summary || !envelope.terminationReason) errors.push('summary or termination reason is missing')
  // Typed, not just present: a non-string slips past the credential scan, which only reads strings.
  if (typeof envelope.summary !== 'string' || typeof envelope.terminationReason !== 'string' || typeof envelope.nextOwnerDecision !== 'string') {
    errors.push('summary, termination reason, or next owner decision is not a string')
  }
  if (Array.isArray(envelope.verification) && !envelope.verification.every((item) => item !== null && typeof item === 'object' && typeof item.name === 'string')) {
    errors.push('a verification entry is malformed')
  }
  if (Array.isArray(envelope.risks) && !envelope.risks.every((risk) => typeof risk === 'string')) errors.push('a risk entry is not a string')
  if (envelope.content !== undefined && typeof envelope.content !== 'string') errors.push('result content is invalid')
  if (!Array.isArray(envelope.verification) || !Array.isArray(envelope.risks)) errors.push('verification or risks is not an array')
  if (envelope.questions !== undefined && !Array.isArray(envelope.questions)) errors.push('questions is not an array')
  if (envelope.dependencyResults !== undefined && !Array.isArray(envelope.dependencyResults)) errors.push('dependencyResults is not an array')
  if (errors.length) throw new ResultEnvelopeRejectedError(errors)

  // Runs after the shape checks so the scan never walks a malformed envelope.
  assertEnvelopeCarriesNoCredentials(envelope)
}

export function resultEnvelopeHash(envelope: AdapterResultEnvelope): string {
  return hashJson(envelope)
}
