import type { AdapterRole, AdapterRunStatus } from '../../shared/jobLoopTypes'
import type { AdapterDependencyResult, AdapterQuestionDraft } from '../../shared/threadTypes'
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

export function validateResultEnvelope(envelope: AdapterResultEnvelope, expected: { taskId: string; jobId: string; inputHash: string }): void {
  const errors: string[] = []
  if (envelope.taskId !== expected.taskId) errors.push('taskId mismatch')
  if (envelope.jobId !== expected.jobId) errors.push('jobId mismatch')
  if (envelope.inputHash !== expected.inputHash) errors.push('inputHash mismatch')
  if (!envelope.adapterId || !envelope.role) errors.push('adapter identity is missing')
  if (!['success', 'partial', 'failed', 'invalid', 'timeout', 'cancelled'].includes(envelope.status)) errors.push('invalid result status')
  if (!envelope.summary || !envelope.terminationReason) errors.push('summary or termination reason is missing')
  if (envelope.content !== undefined && typeof envelope.content !== 'string') errors.push('result content is invalid')
  if (!Array.isArray(envelope.verification) || !Array.isArray(envelope.risks)) errors.push('verification or risks is not an array')
  if (envelope.questions !== undefined && !Array.isArray(envelope.questions)) errors.push('questions is not an array')
  if (envelope.dependencyResults !== undefined && !Array.isArray(envelope.dependencyResults)) errors.push('dependencyResults is not an array')
  if (errors.length) throw new ResultEnvelopeRejectedError(errors)
}

export function resultEnvelopeHash(envelope: AdapterResultEnvelope): string {
  return hashJson(envelope)
}
