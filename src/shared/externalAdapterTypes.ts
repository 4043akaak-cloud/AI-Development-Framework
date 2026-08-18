import type { AdapterCostTier, AdapterRole } from './jobLoopTypes'

/**
 * The only payload an external Adapter may ever receive. It is synthetic on purpose: a fixed
 * exercise for the transport, never the real project, repo, Vault, or conversation history.
 */
export interface SyntheticPacket {
  packetId: string
  packetHash: string
  kind: 'synthetic-connectivity-probe'
  taskId: string
  threadId: string
  jobId: string
  role: AdapterRole
  sequence: number
  attempt: number
  /**
   * Opaque hashes of the approved Scope and Context. They carry no project content, and including
   * them makes `packetHash` change whenever the approved Scope changes, so an approval issued for
   * one Scope cannot authorise a send under another.
   */
  scopeHash: string
  contextHash: string
  /** Fixed instruction text. Never assembled from project content. */
  instruction: string
  resultFormat: string
  stopConditions: string[]
  /** Bounded, explicitly approved dependency content for a local Frontdoor Critic. */
  dependencyContext?: Array<{ nodeId: string; resultHash: string; content: string }>
  createdAt: string
}

export type ExternalOutcomeStatus = 'success' | 'failed' | 'timeout' | 'cancelled' | 'invalid'

/** Provider-reported performance measurements. Values are numeric only; no prompt or answer text. */
export interface ExternalPerformanceMetrics {
  totalDurationNs?: number
  loadDurationNs?: number
  promptEvalCount?: number
  promptEvalDurationNs?: number
  evalCount?: number
  evalDurationNs?: number
}

export interface ExternalSendOutcome {
  status: ExternalOutcomeStatus
  /** Adapter answer text, already truncated by the transport. Absent when nothing was returned. */
  content?: string
  terminationReason: string
  durationMs: number
  /** Optional provider measurements, retained only as bounded numeric diagnostics. */
  metrics?: ExternalPerformanceMetrics
  /** Short, safe error text. Never a stack trace, credential, or request body. */
  errorText?: string
}

/**
 * Owner-issued permission for one external send. Placed on disk outside the renderer, exactly
 * like an approved Task Packet, so nothing inside ADF can mint it.
 */
export interface ExternalSendApproval {
  approvalId: string
  taskId: string
  threadId: string
  adapterId: string
  provider: string
  /** The role the Owner approved this send for. Must match the Adapter and the packet. */
  role: AdapterRole
  /** Binds the approval to one exact payload. */
  packetHash: string
  /** Binds the approval to the Scope and Context it was granted for. */
  scopeHash: string
  contextHash: string
  maxSends: number
  costTier: AdapterCostTier
  approvedBy: string
  approvedAt: string
  expiresAt: string
}

/** One line of the external-call Ledger. Records the fact of a send, never its credentials. */
export interface ExternalCallRecord {
  callId: string
  approvalId: string
  provider: string
  adapterId: string
  role: AdapterRole
  taskId: string
  threadId: string
  jobId: string
  sequence: number
  attempt: number
  packetHash: string
  inputHash: string
  scopeHash: string
  contextHash: string
  status: ExternalOutcomeStatus
  costTier: AdapterCostTier
  durationMs: number
  terminationReason: string
  /** Optional provider measurements, retained only as bounded numeric diagnostics. */
  metrics?: ExternalPerformanceMetrics
  startedAt: string
  finishedAt: string
  errorText?: string
}

/** Result of a read-only `/api/tags`-style check: is the local provider reachable, is the model there. */
export interface OllamaReadiness {
  reachable: boolean
  modelPresent: boolean
  models: string[]
  detail: string
  /** The endpoint and model this check actually targeted, for display next to the result. */
  baseUrl: string
  model: string
}

export interface ExternalPreflight {
  ok: boolean
  provider: string
  adapterId: string
  role: AdapterRole
  connection: string
  scopeHash: string
  contextHash: string
  expiresAt?: string
  sendsRemaining: number
  costTier: AdapterCostTier
  packetHash: string
  approvalId?: string
  /** Whether the credential is set and where. Never carries the value itself. */
  credential: { required: boolean; present: boolean; source: string }
  /** Every check the Owner should see before authorising a send. */
  checks: Array<{ name: string; status: 'pass' | 'fail'; detail: string }>
  blockingReasons: string[]
}
