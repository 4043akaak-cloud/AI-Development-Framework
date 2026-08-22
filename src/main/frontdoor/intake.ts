import type { FrontdoorRequest, FrontdoorRequestInput } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'

export class FrontdoorRequestRejectedError extends Error {
  readonly code = 'FRONTDOOR_REQUEST_REJECTED'
  readonly details: string[]

  constructor(details: string[]) {
    super(`Frontdoor request rejected: ${details.join('; ')}`)
    this.details = details
  }
}

export function validateFrontdoorRequest(input: FrontdoorRequestInput): void {
  const errors: string[] = []
  const nonEmptyText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  if (!nonEmptyText(input?.requestId) || !/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId)) errors.push('requestId must be a safe non-empty identifier')
  if (!nonEmptyText(input?.objective)) errors.push('objective is required')
  if (!nonEmptyText(input?.userInput)) errors.push('userInput is required')
  if (!nonEmptyText(input?.projectRef)) errors.push('projectRef is required')
  if (!nonEmptyText(input?.requestedOutput)) errors.push('requestedOutput is required')
  if (!['codex', 'chatgpt', 'owner', 'test'].includes(input?.source)) errors.push('source is invalid')
  if (!Array.isArray(input?.contextReferences)) errors.push('contextReferences must be an array')
  if (!Array.isArray(input?.scope?.inScope) || !Array.isArray(input?.scope?.outOfScope)) errors.push('scope is invalid')
  if (!input?.constraints || input.constraints.externalSend !== false) errors.push('externalSend must be false')
  if (!Array.isArray(input?.constraints?.allowedCapabilities) || input.constraints.allowedCapabilities.length === 0) errors.push('allowedCapabilities are required')
  if (!Number.isInteger(input?.constraints?.maxNodes) || input.constraints.maxNodes < 1) errors.push('maxNodes must be a positive integer')
  if (!Number.isInteger(input?.constraints?.maxDepth) || input.constraints.maxDepth < 1) errors.push('maxDepth must be a positive integer')
  if (input?.sourceCandidateBinding) {
    const binding = input.sourceCandidateBinding
    const identifiers: Array<[string, unknown]> = [
      ['candidateId', binding.candidateId],
      ['artifactRef', binding.artifactRef],
      ['reviewDecisionId', binding.reviewDecisionId],
      ['childRunId', binding.childRunId],
      ['parentRunId', binding.parentRunId],
      ['sourceAggregateRef', binding.sourceAggregateRef],
      ['sourceResultRef', binding.sourceResultRef],
      ['sourceEvidenceRef', binding.sourceEvidenceRef]
    ]
    for (const [label, value] of identifiers) if (!nonEmptyText(value) || value.includes('..')) errors.push(`sourceCandidateBinding.${label} is invalid`)
    const hashes: Array<[string, unknown]> = [
      ['candidateHash', binding.candidateHash],
      ['reviewTargetHash', binding.reviewTargetHash],
      ['sourceAggregateHash', binding.sourceAggregateHash],
      ['sourceResultHash', binding.sourceResultHash],
      ['sourceEvidenceHash', binding.sourceEvidenceHash],
      ['bindingHash', binding.bindingHash]
    ]
    for (const [label, value] of hashes) if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) errors.push(`sourceCandidateBinding.${label} must be a SHA-256 hash`)
  }
  if (errors.length) throw new FrontdoorRequestRejectedError(errors)
}

export function createFrontdoorRequest(input: FrontdoorRequestInput, receivedAt = new Date().toISOString()): FrontdoorRequest {
  validateFrontdoorRequest(input)
  return { ...input, state: 'ready-for-decomposition', receivedAt, inputHash: hashJson({ ...input, receivedAt }) }
}
