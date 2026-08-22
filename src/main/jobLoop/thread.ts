import type { ConversationThread, ConversationTurn, OwnerAction, RecoveryInfo, ThreadState, ThreadSummary } from '../../shared/threadTypes'
import type { AdapterPlan } from '../../shared/jobLoopTypes'
import type { ImplementationSourceBinding } from '../../shared/implementationTypes'
import { hashJson } from './hash'

export const defaultMaxTurns = 6

export class ThreadRejectedError extends Error {
  readonly code = 'THREAD_REJECTED'
  readonly details: string[]

  constructor(details: string[]) {
    super(`Thread rejected: ${details.join('; ')}`)
    this.details = details
  }
}

const threadTransitions: Record<ThreadState, readonly ThreadState[]> = {
  open: ['awaiting-owner', 'recovery-needed', 'stopped', 'failed'],
  'awaiting-owner': ['open', 'stopped', 'approved', 'failed'],
  'recovery-needed': ['open', 'awaiting-owner', 'stopped'],
  approved: ['completed', 'stopped'],
  stopped: [],
  completed: [],
  failed: []
}

export function assertThreadTransition(from: ThreadState, to: ThreadState): void {
  if (!threadTransitions[from]?.includes(to)) throw new ThreadRejectedError([`invalid thread transition: ${from} -> ${to}`])
}

export function turnHash(turn: ConversationTurn): string {
  return hashJson(turn)
}

export interface CreateThreadInput {
  threadId: string
  taskId: string
  jobId: string
  title: string
  approvalId: string
  scopeHash: string
  contextHash: string
  routingPlanHash: string
  adapterPlan: AdapterPlan
  approvedFileSet?: readonly string[]
  implementationBinding?: ImplementationSourceBinding
  inputHash: string
  createdAt: string
  maxTurns?: number
}

export function createThread(input: CreateThreadInput): ConversationThread {
  const maxTurns = input.maxTurns ?? defaultMaxTurns
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new ThreadRejectedError(['maxTurns must be a positive integer'])
  if (!input.threadId || !input.taskId || !input.jobId) throw new ThreadRejectedError(['threadId, taskId and jobId are required'])
  if (!input.approvalId || !input.scopeHash || !input.contextHash || !input.routingPlanHash || !input.inputHash) {
    throw new ThreadRejectedError(['a Thread requires an approvalId, scopeHash, contextHash, routingPlanHash and inputHash'])
  }
  if (!input.adapterPlan || !Array.isArray(input.adapterPlan.selections) || input.adapterPlan.selections.length === 0) {
    throw new ThreadRejectedError(['a Thread requires a non-empty adapterPlan, matching the approved routingPlanHash'])
  }
  return {
    threadId: input.threadId,
    taskId: input.taskId,
    jobId: input.jobId,
    title: input.title,
    approvalId: input.approvalId,
    scopeHash: input.scopeHash,
    contextHash: input.contextHash,
    routingPlanHash: input.routingPlanHash,
    adapterPlan: input.adapterPlan,
    ...(input.approvedFileSet ? { approvedFileSet: [...input.approvedFileSet] } : {}),
    ...(input.implementationBinding ? { implementationBinding: input.implementationBinding } : {}),
    inputHash: input.inputHash,
    state: 'open',
    maxTurns,
    turns: [],
    ownerDecisions: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  }
}

export function lastTurn(thread: ConversationThread): ConversationTurn | undefined {
  return thread.turns[thread.turns.length - 1]
}

/**
 * Order, duplicate and parent-hash invariants. Shared by the normal and the recovery path so
 * neither can weaken them.
 */
function turnPlacementErrors(thread: ConversationThread, turn: ConversationTurn): string[] {
  const errors: string[] = []
  if (turn.threadId !== thread.threadId) errors.push('threadId mismatch')
  if (turn.jobId !== thread.jobId) errors.push('jobId mismatch')
  if (!turn.turnId) errors.push('turnId is required')
  if (thread.turns.some((existing) => existing.turnId === turn.turnId)) errors.push(`duplicate turnId: ${turn.turnId}`)
  if (turn.sequence !== thread.turns.length) errors.push(`turn sequence must be ${thread.turns.length}, received ${turn.sequence}`)
  if (thread.turns.length >= thread.maxTurns) errors.push(`max turns exceeded: ${thread.maxTurns}`)
  if (!turn.content) errors.push('turn content is required')
  if (!['success', 'partial', 'failed', 'invalid'].includes(turn.status)) errors.push('invalid turn status')

  if (turn.respondsToTurnId) {
    const parent = thread.turns.find((existing) => existing.turnId === turn.respondsToTurnId)
    if (!parent) errors.push(`respondsToTurnId not found in thread: ${turn.respondsToTurnId}`)
    else if (turn.respondsToHash !== turnHash(parent)) errors.push('respondsToHash does not match the parent turn')
  } else if (turn.respondsToHash) {
    errors.push('respondsToHash requires respondsToTurnId')
  } else if (thread.turns.length > 0) {
    errors.push('every turn after the first must reference a parent turn')
  }

  return errors
}

function withAppendedTurn(thread: ConversationThread, turn: ConversationTurn, errors: string[]): ConversationThread {
  if (errors.length) throw new ThreadRejectedError(errors)
  return { ...thread, turns: [...thread.turns, turn], updatedAt: turn.createdAt }
}

/** Appends an Adapter answer. Pure: returns a new Thread and never mutates the input. */
export function appendTurn(thread: ConversationThread, turn: ConversationTurn): ConversationThread {
  const errors = turnPlacementErrors(thread, turn)
  if (thread.state !== 'open') errors.unshift(`thread is not open: ${thread.state}`)
  return withAppendedTurn(thread, turn, errors)
}

/**
 * Appends an ADF-authored failure record from `recovery-needed`. This is the only way a Turn can
 * be added outside `open`, and it accepts nothing but a `failed` Turn carrying an error reference.
 */
export function appendRecoveryTurn(thread: ConversationThread, turn: ConversationTurn): ConversationThread {
  const errors = turnPlacementErrors(thread, turn)
  if (thread.state !== 'recovery-needed') errors.unshift(`thread is not recovery-needed: ${thread.state}`)
  if (turn.status !== 'failed') errors.push(`a recovery turn must be failed, received ${turn.status}`)
  if (!turn.errorRef) errors.push('a recovery turn requires an errorRef')
  return withAppendedTurn(thread, turn, errors)
}

export function withState(thread: ConversationThread, to: ThreadState, at: string, stopReason?: string): ConversationThread {
  assertThreadTransition(thread.state, to)
  return { ...thread, state: to, updatedAt: at, ...(stopReason ? { stopReason } : {}) }
}

const ownerActionTargets: Record<OwnerAction, ThreadState> = {
  continue: 'open',
  stop: 'stopped',
  approve: 'approved',
  'next-task': 'completed'
}

/** Evidence before integration: an Owner cannot approve a Thread that produced no validated Result. */
export function hasAdoptableEvidence(thread: ConversationThread): boolean {
  return thread.turns.some((turn) => Boolean(turn.resultEnvelopeRef) && (turn.status === 'success' || turn.status === 'partial'))
}

/** Moves a Thread into recovery and records what ADF knows about the interrupted send. */
export function enterRecovery(thread: ConversationThread, info: RecoveryInfo, at: string): ConversationThread {
  return { ...withState(thread, 'recovery-needed', at), recovery: info }
}

/** Leaves recovery. The `recovery` block is dropped so a resolved Thread carries no stale reason. */
export function leaveRecovery(thread: ConversationThread, to: ThreadState, at: string, stopReason?: string): ConversationThread {
  if (thread.state !== 'recovery-needed') throw new ThreadRejectedError([`thread is not recovery-needed: ${thread.state}`])
  const { recovery: _recovery, ...rest } = withState(thread, to, at, stopReason)
  return rest
}

export function applyOwnerDecision(thread: ConversationThread, action: OwnerAction, decidedAt: string, note?: string): ConversationThread {
  const target = ownerActionTargets[action]
  if (!target) throw new ThreadRejectedError([`unknown owner action: ${action}`])
  if (thread.state === 'recovery-needed') {
    throw new ThreadRejectedError([`thread needs recovery; use a recovery action instead of ${action}`])
  }
  if (action === 'approve' && !hasAdoptableEvidence(thread)) {
    throw new ThreadRejectedError(['approve requires at least one turn with a validated result envelope'])
  }
  if (action === 'continue' && thread.turns.length >= thread.maxTurns) {
    return {
      ...withState(thread, 'failed', decidedAt, `max turns reached: ${thread.maxTurns}`),
      ownerDecisions: [...thread.ownerDecisions, { action, atTurnId: lastTurn(thread)?.turnId ?? null, decidedAt, note }]
    }
  }
  const moved = withState(thread, target, decidedAt, action === 'stop' ? (note ?? 'stopped by Project Owner') : undefined)
  return { ...moved, ownerDecisions: [...moved.ownerDecisions, { action, atTurnId: lastTurn(thread)?.turnId ?? null, decidedAt, note }] }
}

export function summarize(thread: ConversationThread): ThreadSummary {
  const latest = lastTurn(thread)
  return {
    threadId: thread.threadId,
    taskId: thread.taskId,
    title: thread.title,
    state: thread.state,
    turnCount: thread.turns.length,
    maxTurns: thread.maxTurns,
    lastAdapterId: latest?.adapterId ?? null,
    lastTurnStatus: latest?.status ?? null,
    ownerActionRequired: thread.state === 'awaiting-owner',
    recoveryRequired: thread.state === 'recovery-needed',
    ...(thread.recovery ? { recoveryReason: thread.recovery.reason } : {}),
    updatedAt: thread.updatedAt,
    ...(thread.stopReason ? { stopReason: thread.stopReason } : {})
  }
}
