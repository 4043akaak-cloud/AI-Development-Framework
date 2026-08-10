import type { AdapterRole, ResultStatus } from './jobLoopTypes'

export type ThreadState = 'open' | 'awaiting-owner' | 'stopped' | 'approved' | 'completed' | 'failed'
export type TurnStatus = ResultStatus
export type OwnerAction = 'continue' | 'stop' | 'approve' | 'next-task'

export interface ConversationTurn {
  turnId: string
  threadId: string
  jobId: string
  dispatchId?: string
  sequence: number
  adapterId: string
  role: AdapterRole
  respondsToTurnId?: string
  respondsToHash?: string
  content: string
  status: TurnStatus
  resultEnvelopeRef?: string
  /** Hash of the stored Result Envelope, re-checked before the Owner can approve. */
  resultEnvelopeHash?: string
  errorRef?: string
  createdAt: string
}

export interface OwnerDecisionRecord {
  action: OwnerAction
  atTurnId: string | null
  decidedAt: string
  note?: string
}

export interface ConversationThread {
  threadId: string
  taskId: string
  jobId: string
  title: string
  /** Binds the Thread to the Owner approval that authorised it. */
  approvalId: string
  scopeHash: string
  contextHash: string
  routingPlanHash: string
  /** Job input hash from the registered Job, used to bind every Result Envelope to this Job. */
  inputHash: string
  state: ThreadState
  maxTurns: number
  turns: ConversationTurn[]
  ownerDecisions: OwnerDecisionRecord[]
  createdAt: string
  updatedAt: string
  stopReason?: string
}

/** Pending send that has not yet produced a Turn. External adapters answer asynchronously. */
export interface RelayDispatchHandle {
  dispatchId: string
  threadId: string
  taskId: string
  jobId: string
  adapterId: string
  role: AdapterRole
  sequence: number
  respondsToTurnId?: string
  respondsToHash?: string
  sentAt: string
}

export interface RelayTurnPayload {
  content: string
  status: TurnStatus
  /** Substantive Result fields. ADF owns the identity/hash fields so an Adapter cannot forge them. */
  summary?: string
  verification?: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks?: string[]
  errorRef?: string
}

export type RelayResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Adapter-side run state, so an external Adapter can be polled before its answer exists. */
export type AdapterRunState = 'accepted' | 'running' | 'ready' | 'failed'

export interface ThreadSummary {
  threadId: string
  taskId: string
  title: string
  state: ThreadState
  turnCount: number
  maxTurns: number
  lastAdapterId: string | null
  lastTurnStatus: TurnStatus | null
  ownerActionRequired: boolean
  updatedAt: string
  stopReason?: string
}
