import type { ApprovedTaskPacket, Capability, JobState } from '../../shared/jobLoopTypes'
import { validateAdapterPlan } from './adapterRegistry'
import { hashJson } from './hash'

export const allowedCapabilities: readonly Capability[] = ['read', 'propose']

export class TaskPacketRejectedError extends Error {
  readonly code = 'TASK_PACKET_REJECTED'
  readonly details: string[]

  constructor(details: string[]) {
    super(`Task packet rejected: ${details.join('; ')}`)
    this.details = details
  }
}

export function validateApprovedTask(packet: ApprovedTaskPacket, clock = new Date()): void {
  const errors: string[] = []
  if (!packet?.taskId) errors.push('taskId is required')
  if (!packet?.scope || packet.scopeHash !== hashJson(packet.scope)) errors.push('scope hash mismatch')
  if (!packet?.context || packet.contextHash !== hashJson(packet.context)) errors.push('context hash mismatch')
  if (!packet?.target?.repository || !packet.target.branch || !packet.target.worktree) errors.push('dispatch target is incomplete')
  if (!Array.isArray(packet?.target?.allowedFiles) || !Array.isArray(packet?.target?.forbiddenChanges)) errors.push('dispatch target boundaries are invalid')

  const approval = packet?.approval
  if (!approval || approval.status !== 'active') errors.push('active approval is required')
  if (!approval?.taskId || approval.taskId !== packet.taskId) errors.push('approval taskId mismatch')
  if (!approval?.scopeHash || approval.scopeHash !== packet.scopeHash) errors.push('approval scope hash mismatch')
  if (!approval?.routingPlanHash || approval.routingPlanHash !== hashJson(packet.adapterPlan)) errors.push('approval routing plan hash mismatch')
  if (!approval?.approvedBy) errors.push('approval owner is required')

  const expiresAt = approval?.expiresAt ? new Date(approval.expiresAt).getTime() : Number.NaN
  if (!Number.isFinite(expiresAt)) errors.push('approval expiry is invalid')
  else if (expiresAt <= clock.getTime()) errors.push('approval is expired')

  if (!Array.isArray(approval?.capabilities) || approval.capabilities.some((capability) => !allowedCapabilities.includes(capability))) {
    errors.push('capability is outside the Fake Adapter grant')
  }
  if (!packet?.adapter) errors.push('adapter mode is required')
  try {
    validateAdapterPlan(packet.adapterPlan)
  } catch (error) {
    errors.push((error as Error).message)
  }
  if (!['success', 'partial', 'failed', 'invalid'].includes(packet?.fixtureMode)) errors.push('unknown fixture mode')
  if (errors.length) throw new TaskPacketRejectedError(errors)
}

export function createDispatchKey(packet: ApprovedTaskPacket): string {
  return hashJson([packet.taskId, packet.scopeHash, packet.contextHash, packet.target, packet.adapter, 'debate-round-1'])
}

const transitions: Record<JobState, readonly JobState[]> = {
  queued: ['running', 'cancelled', 'recovery-needed'],
  running: ['awaiting-review', 'failed', 'cancelled', 'recovery-needed'],
  'awaiting-review': [],
  failed: [],
  cancelled: [],
  // A Job in recovery is not finished: the Owner can resend, abandon, or record the failure.
  'recovery-needed': ['running', 'cancelled', 'failed']
}

export function canTransition(from: JobState, to: JobState): boolean {
  return transitions[from]?.includes(to) ?? false
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) throw new Error(`Invalid job transition: ${from} -> ${to}`)
}
