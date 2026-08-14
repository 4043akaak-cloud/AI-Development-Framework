import type { AdapterPlan, AdapterRole, AdapterRunStatus, ResultStatus } from './jobLoopTypes'


export type ThreadState = 'open' | 'awaiting-owner' | 'recovery-needed' | 'stopped' | 'approved' | 'completed' | 'failed'
export type TurnStatus = ResultStatus
export type OwnerAction = 'continue' | 'stop' | 'approve' | 'next-task'

/** Why a Thread needs Owner-driven recovery. */
export type RecoveryReason = 'answer-unavailable' | 'send-unconfirmed'
export type RecoveryAction = 'resend' | 'record-failure' | 'stop'

/** What ADF knows about the interrupted send, shown to the Owner before they choose. */
export interface RecoveryInfo {
  reason: RecoveryReason
  dispatchId: string
  sequence: number
  adapterId: string
  role: AdapterRole
  attempt: number
  sentAt: string
  expiresAt?: string
  detectedAt: string
  respondsToTurnId?: string
  respondsToHash?: string
  /** First 200 characters of a getState() exception. Never a stack trace or credentials. */
  probeError?: string
}

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
  questions?: AdapterQuestionDraft[]
  dependencyResults?: AdapterDependencyResult[]
  orchestrationRunId?: string
  resultEnvelopeRef?: string
  /** Hash of the stored Result Envelope, re-checked before the Owner can approve. */
  resultEnvelopeHash?: string
  errorRef?: string
  createdAt: string
}

/** Optional structured questions returned by an Adapter. The Frontdoor layer owns aggregation. */
export interface AdapterQuestionDraft {
  kind: 'clarification' | 'missing-context' | 'scope-change' | 'approval-required' | 'execution-blocked' | 'conflict'
  text: string
  required?: boolean
  blocking?: boolean
  options?: string[]
}

export interface AdapterDependencyResult {
  runId: string
  nodeId: string
  resultRef: string
  resultHash: string
  status: string
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
  /** The approved Task Packet's own adapterPlan, hash-bound to routingPlanHash. An explicit adapterId
   *  dispatch to a local-only adapter must be one of these selections — see relay.ts sendToAdapterUnsafe. */
  adapterPlan: AdapterPlan
  /** Job input hash from the registered Job, used to bind every Result Envelope to this Job. */
  inputHash: string
  state: ThreadState
  maxTurns: number
  turns: ConversationTurn[]
  ownerDecisions: OwnerDecisionRecord[]
  createdAt: string
  updatedAt: string
  stopReason?: string
  /** Present only while state is `recovery-needed`. Cleared when the Owner resolves it. */
  recovery?: RecoveryInfo
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
  /** 0 for the first send of a sequence, incremented by every Owner-driven resend. */
  attempt: number
  respondsToTurnId?: string
  respondsToHash?: string
  sentAt: string
  /** Display-only deadline. Passing it never triggers an automatic action. */
  expiresAt: string
  dependencyResults?: AdapterDependencyResult[]
  orchestrationRunId?: string
}

export interface RelayTurnPayload {
  content: string
  status: TurnStatus
  /** Substantive Result fields. ADF owns the identity/hash fields so an Adapter cannot forge them. */
  summary?: string
  verification?: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks?: string[]
  questions?: AdapterQuestionDraft[]
  dependencyResults?: AdapterDependencyResult[]
  orchestrationRunId?: string
  errorRef?: string
  /** Lets an Adapter record `timeout` / `cancelled`, which a Turn status cannot express. */
  envelopeStatus?: AdapterRunStatus
  terminationReason?: string
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
  recoveryRequired: boolean
  recoveryReason?: RecoveryReason
  updatedAt: string
  stopReason?: string
}
