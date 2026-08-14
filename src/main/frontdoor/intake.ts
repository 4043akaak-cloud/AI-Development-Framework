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
  if (!input?.requestId) errors.push('requestId is required')
  if (!input?.objective?.trim()) errors.push('objective is required')
  if (!input?.userInput?.trim()) errors.push('userInput is required')
  if (!input?.projectRef?.trim()) errors.push('projectRef is required')
  if (!input?.requestedOutput?.trim()) errors.push('requestedOutput is required')
  if (!Array.isArray(input?.contextReferences)) errors.push('contextReferences must be an array')
  if (!Array.isArray(input?.scope?.inScope) || !Array.isArray(input?.scope?.outOfScope)) errors.push('scope is invalid')
  if (!input?.constraints || input.constraints.externalSend !== false) errors.push('externalSend must be false')
  if (!Array.isArray(input?.constraints?.allowedCapabilities) || input.constraints.allowedCapabilities.length === 0) errors.push('allowedCapabilities are required')
  if (!Number.isInteger(input?.constraints?.maxNodes) || input.constraints.maxNodes < 1) errors.push('maxNodes must be a positive integer')
  if (!Number.isInteger(input?.constraints?.maxDepth) || input.constraints.maxDepth < 1) errors.push('maxDepth must be a positive integer')
  if (errors.length) throw new FrontdoorRequestRejectedError(errors)
}

export function createFrontdoorRequest(input: FrontdoorRequestInput, receivedAt = new Date().toISOString()): FrontdoorRequest {
  validateFrontdoorRequest(input)
  return { ...input, state: 'ready-for-decomposition', receivedAt, inputHash: hashJson({ ...input, receivedAt }) }
}
