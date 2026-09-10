import type { AdapterRole, Capability, JobScope, ResultStatus } from './jobLoopTypes'
import type { AcceptedCandidateSourceBinding, ImplementationSourceBinding } from './implementationTypes'
import type { ParticipantAssignmentProposal, ParticipantEvidenceCandidate, ParticipantRole } from './participantTypes'

export type FrontdoorRequestState = 'received' | 'needs-clarification' | 'ready-for-decomposition' | 'rejected'
export type OrchestrationState = 'ready-for-approval' | 'running' | 'awaiting-owner' | 'complete' | 'partial' | 'blocked-by-question' | 'failed' | 'cancelled'
export type OrchestrationNodeState = 'queued' | 'ready' | 'running' | 'completed' | 'awaiting-question' | 'failed' | 'cancelled' | 'recovery-needed'
export type FrontdoorQuestionKind = 'clarification' | 'missing-context' | 'scope-change' | 'approval-required' | 'execution-blocked' | 'conflict'
export type FrontdoorQuestionStatus = 'open' | 'answered' | 'dismissed'

export type OwnerGate = 'intake' | 'completion-shape' | 'decomposition' | 'dispatch' | 'node-review' | 'question' | 'result-review' | 'completion' | 'artifact-export' | 'candidate-review'
export type OwnerDecision = 'clarify' | 'edit' | 'reject' | 'proceed' | 'approve' | 'approve-selected' | 'dispatch' | 'defer' | 'stop' | 'answer' | 'revise-plan' | 'accept' | 'follow-up' | 'continue' | 'complete' | 'export'
export type OwnerGateState = 'received' | `awaiting-owner:${OwnerGate}` | 'running' | 'completed' | 'stopped' | 'rejected' | 'blocked'


export interface OwnerDecisionEnvelope {
  decisionId: string
  runId: string
  requestId: string
  gate: OwnerGate
  nodeId?: string
  decision: OwnerDecision
  targetHash: string
  approvedBy: string
  decidedAt: string
  allowedCapability?: Capability
  dataPolicy?: string
  expiresAt?: string
  note?: string
  answerRef?: string
  /**
   * Set when a Gate admitted something through a backward-compatibility route rather than the
   * current check. Typed rather than folded into `note`, because `note` is free text an Owner also
   * writes into: a downstream reader cannot tell an Owner's sentence from ADF's own record.
   */
  compatibility?: OwnerDecisionCompatibility
}

export interface OwnerDecisionCompatibility {
  route: 'legacy-aggregate-missing-child-result-hash' | 'completed-without-independent-review'
  /** For a legacy aggregate, the Node ids. For an uncleared completion, why the review did not clear. */
  nodeIds: string[]
}

export interface FrontdoorConstraints {
  allowedCapabilities: Capability[]
  maxNodes: number
  maxDepth: number
  externalSend: false
}

export interface FrontdoorRequestInput {
  requestId: string
  source: 'codex' | 'chatgpt' | 'owner' | 'participant' | 'test'
  /** Runtime participant identity; it is an assignment, not a permanent Frontdoor provider. */
  sourceParticipantId?: string
  sourceParticipantRole?: ParticipantRole
  objective: string
  userInput: string
  projectRef: string
  constraints: FrontdoorConstraints
  requestedOutput: string
  contextReferences: string[]
  scope: JobScope
  runKind?: 'frontdoor' | 'implementation'
  implementationBinding?: ImplementationSourceBinding
  sourceCandidateBinding?: AcceptedCandidateSourceBinding
}

export interface FrontdoorPrepareInput {
  request: FrontdoorRequestInput
  plan: DecompositionPlanInput
}

export interface FrontdoorPrepareResult {
  run: OrchestrationRun
  reused: boolean
}

export interface FrontdoorPlanProposal {
  plannerId: string
  plannerVersion: string
  requestId: string
  requestHash: string
  plan: DecompositionPlan
  assumptions: string[]
  risks: string[]
  registrySnapshotHash: string
  generatedAt: string
}

export interface FrontdoorRequest extends FrontdoorRequestInput {
  state: FrontdoorRequestState
  receivedAt: string
  inputHash: string
}

export interface DecompositionNode {
  nodeId: string
  objective: string
  role: AdapterRole
  adapterId: string
  /** Optional explicit skill contract. Codex-internal skill use is not inferred when absent. */
  skillId?: string
  scope: JobScope
  contextReferences: string[]
  acceptance: string[]
  stopConditions: string[]
  capabilities: Capability[]
  dependsOn: string[]
  depth: number
  /** Optional per-Task participant assignment. Omitted for legacy plans. */
  participantAssignment?: ParticipantAssignmentProposal
}

/** Node間のOwner確認を、承認済みPlan内で安全条件付きに自動継続するか。 */
export type NodeReviewPolicy = 'auto-continue-safe' | 'owner-each-node'

export interface DecompositionPlanInput {
  planId: string
  requestId: string
  version: number
  nodes: DecompositionNode[]
  aggregationPolicy: 'collect-all' | 'stop-on-blocking-question'
  /** Omitted legacy Plans are normalized to auto-continue-safe at creation time. */
  nodeReviewPolicy?: NodeReviewPolicy
}

export interface DecompositionPlan extends DecompositionPlanInput {
  planHash: string
}

export interface OrchestrationNodeRecord {
  node: DecompositionNode
  state: OrchestrationNodeState
  childTaskId: string
  childJobId?: string
  threadId?: string
  resultStatus?: ResultStatus
  resultRef?: string
  resultHash?: string
  evidenceHash?: string
  childInputHash?: string
  questionIds: string[]
  attempt: number
  error?: string
}

export interface OrchestrationRun {
  runId: string
  requestId: string
  requestHash: string
  planHash: string
  state: OrchestrationState
  nodes: OrchestrationNodeRecord[]
  approvalIds: string[]
  openQuestionIds: string[]
  aggregateResultRef?: string
  createdAt: string
  updatedAt: string
  ownerGate?: OwnerGateState
  nodeReview?: FrontdoorNodeReview
  runKind?: 'frontdoor' | 'implementation'
  implementationBinding?: ImplementationSourceBinding
  sourceCandidateBinding?: AcceptedCandidateSourceBinding
}

export interface FrontdoorNodeReview {
  nodeId: string
  resultRef?: string
  resultHash?: string
  status?: ResultStatus
  summary?: string
  content?: string
  verification: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks: string[]
  nextNodeIds: string[]
  targetHash: string
}

export interface FrontdoorQuestion {
  questionId: string
  runId: string
  nodeId: string
  sourceResultId?: string
  kind: FrontdoorQuestionKind
  text: string
  required: boolean
  blocking: boolean
  options: string[]
  status: FrontdoorQuestionStatus
  answerRef?: string
}

export interface AggregateResult {
  aggregateId: string
  runId: string
  status: Exclude<OrchestrationState, 'ready-for-approval' | 'running'>
  completedNodes: string[]
  failedNodes: string[]
  partialNodes: string[]
  childResults: Array<{ nodeId: string; status: ResultStatus; resultRef?: string; resultHash?: string }>
  openQuestions: FrontdoorQuestion[]
  conflicts: string[]
  evidenceRefs: string[]
  ownerDecisionRequired: boolean
  nextAction: string
  createdAt: string
}

/** What the Owner sees after ADF derives the child Packets, before approving the Dispatch that binds them. */
export interface FrontdoorChildPacketSummary {
  nodeId: string
  taskId: string
  adapterId: string
  role: string
  capabilities: string[]
  packetHash: string
  path: string
}

export interface GoalAlignmentSignal {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export type GoalAlignmentStatus = 'aligned' | 'awaiting-owner' | 'drift' | 'blocked' | 'evidence-gap'
export type NorthStarStep = 'intake' | 'plan' | 'dispatch' | 'ai-execution' | 'node-review' | 'result-review' | 'completion' | 'completed'

export interface GoalAlignmentReport {
  status: GoalAlignmentStatus
  currentStep: NorthStarStep
  expectedOwnerGate?: OwnerGate
  actualOwnerGate?: string
  completedSteps: NorthStarStep[]
  nextUnlockedStep?: NorthStarStep | 'next-request'
  nextAction: string
  signals: GoalAlignmentSignal[]
  goal: {
    northStar: string
    finalFlowContribution: string
    verticalSliceOutcome: string
  }
}

export interface FrontdoorReturn {
  requestId: string
  runId: string
  status: AggregateResult['status']
  summary: string
  answer: string
  childResultRefs: string[]
  openQuestions: FrontdoorQuestion[]
  unresolvedRisks: string[]
  evidenceRefs: string[]
  ownerDecisionRequired: boolean
  nextAction: string
}

export interface NodeTelemetry {
  nodeId: string
  role: string
  adapterId: string
  /** Absent when the Node has not run. Never defaulted to 0 — unmeasured is not instant. */
  durationMs?: number
  status?: string
  terminationReason?: string
  /** Present only for adapters that make an external call. */
  provider?: string
  costTier?: string
  /** Time the provider spent loading the model rather than answering, where it reports it. */
  modelLoadMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** Distinguishes "reported zero tokens" from "reported nothing". */
  tokensRecorded: boolean
}

export interface RunTelemetry {
  nodes: NodeTelemetry[]
  nodeCount: number
  measuredNodeCount: number
  totalDurationMs: number
  /** Summed across reporting Nodes only; read with `tokenReportingNodeCount`. */
  totalTokens: number
  tokenReportingNodeCount: number
  failedNodeCount: number
}

export type OwnerGateWaitSeverity = 'fresh' | 'aging' | 'stale'

/** How long a Run has been waiting on the Owner, derived from the Ledger rather than `updatedAt`. */
export interface OwnerGateWaitReport {
  runId: string
  gate: OwnerGate
  /** When the current gate opened. From `frontdoor.owner-gate-opened`, so it is replayable. */
  openedAt: string
  waitingMs: number
  waitingDays: number
  nextAction: string
  severity: OwnerGateWaitSeverity
}

export interface FrontdoorInspection {
  run: OrchestrationRun
  request: FrontdoorRequest
  plan: DecompositionPlan
  decisions: OwnerDecisionEnvelope[]
  aggregate?: AggregateResult
  aggregateHash?: string
  workPlaneArtifact?: WorkPlaneArtifactManifest
  participantEvidence?: ParticipantEvidenceCandidate[]
  evidenceRefs: string[]
  openQuestions: FrontdoorQuestion[]
  nextAction: string
  eventCount: number
  nodeTargetHashes: Record<string, string>
  nodeReview?: FrontdoorNodeReview
  activities: FrontdoorActivity[]
  collaborationMessages?: CollaborationMessage[]
  goalAlignment?: GoalAlignmentReport
  /** Present only while the Run waits on an Owner decision. */
  ownerGateWait?: OwnerGateWaitReport
  /** Derived from Result Envelopes and the external-call log. Adds no measurement of its own. */
  telemetry?: RunTelemetry
}

export type CollaborationMessageKind = 'request' | 'proposal' | 'question' | 'review' | 'answer' | 'handoff' | 'result'
export type CollaborationMessageStatus = 'posted' | 'waiting' | 'completed' | 'blocked'

/**
 * Read-only Project Collaboration Room projection. It deliberately references the existing
 * Frontdoor Run/Thread/Result instead of creating a second conversation source of truth.
 */
export interface CollaborationMessage {
  messageId: string
  projectRef: string
  conversationId: string
  runId: string
  senderParticipantId: string
  senderRole: string
  recipientParticipantIds: string[]
  kind: CollaborationMessageKind
  status: CollaborationMessageStatus
  summary: string
  content: string
  parentMessageId?: string
  nodeId?: string
  executionThreadId?: string
  resultRef?: string
  resultHash?: string
  context: {
    mode: 'bounded'
    chars: number
    estimatedTokens: number
    referenceCount: number
  }
  createdAt: string
}

export interface FrontdoorArtifactInspection {
  runId: string
  manifest: WorkPlaneArtifactManifest
  content: unknown
}

export interface WorkPlaneArtifactManifest {
  artifactId: string
  runId: string
  requestId: string
  taskId: string
  nodeId: string
  jobId: string
  threadId: string
  requestHash: string
  planHash: string
  resultHash: string
  aggregateHash: string
  contentHash: string
  resultRef: string
  relativePath: string
  contentType: 'application/json'
  ownerDecisionIds: string[]
  createdAt: string
  status: 'exported'
  candidateKind?: 'candidate-file-set'
  candidateHash?: string
  candidateFiles?: Array<{ relativePath: string; contentHash: string }>
  parentRunId?: string
  sourceAggregateRef?: string
  sourceAggregateHash?: string
  sourceResultHash?: string
  contextBundleHash?: string
}

export type FrontdoorActivityKind = 'system' | 'owner' | 'agent' | 'verification'
export type FrontdoorActivityStatus = 'complete' | 'running' | 'waiting' | 'failed' | 'stopped'

export interface FrontdoorActivity {
  activityId: string
  kind: FrontdoorActivityKind
  status: FrontdoorActivityStatus
  label: string
  detail: string
  occurredAt: string
  eventType: FrontdoorEventType
  nodeId?: string
  adapterId?: string
  role?: AdapterRole
  /** Present only when the caller explicitly records a skill contract. */
  skillId?: string
}

export interface FrontdoorRunSummary {
  runId: string
  requestId: string
  objective: string
  state: OrchestrationState
  ownerGate?: OwnerGateState
  updatedAt: string
  nodeCount: number
  openQuestionCount: number
  packetsReady: boolean
  /** Present only while this Run waits on an Owner decision. */
  ownerGateWait?: OwnerGateWaitReport
}

export type FrontdoorEventType =
  | 'frontdoor.run-created'
  | 'frontdoor.approval-bound'
  | 'frontdoor.owner-gate-opened'
  | 'frontdoor.owner-decision-recorded'
  | 'frontdoor.plan-revised'
  | 'frontdoor.node-approved'
  | 'frontdoor.node-review-opened'
  | 'frontdoor.node-review-continued'
  | 'frontdoor.question-answered'
  | 'frontdoor.result-reviewed'
  | 'frontdoor.completion-proposed'
  | 'frontdoor.completion-approved'
  | 'frontdoor.question-opened'
  | 'frontdoor.node-started'
  | 'frontdoor.node-completed'
  | 'frontdoor.node-failed'
  | 'frontdoor.question-opened'
  | 'frontdoor.run-recovery-needed'
  | 'frontdoor.run-stopped'
  | 'frontdoor.run-completed'
  | 'frontdoor.run-snapshot'
  | 'frontdoor.candidate-review-started'
  | 'frontdoor.candidate-reviewed'
  | 'frontdoor.candidate-request-created'
  /** An independent review recorded against a Run. Not replayed: it never changes Run state. */
  | 'frontdoor.review-run-recorded'
  /** ADF derived the child Packets from the approved Plan, with the hashes it produced. Not replayed. */
  | 'frontdoor.child-packets-derived'


export interface FrontdoorLedgerEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: 1
  sequence: number
  eventId: string
  runId: string
  occurredAt: string
  previousEventHash: string
  eventHash: string
  type: FrontdoorEventType
  payload: TPayload
}
