import type { AdapterRole, Capability, JobScope, ResultStatus } from './jobLoopTypes'

export type FrontdoorRequestState = 'received' | 'needs-clarification' | 'ready-for-decomposition' | 'rejected'
export type OrchestrationState = 'ready-for-approval' | 'running' | 'awaiting-owner' | 'complete' | 'partial' | 'blocked-by-question' | 'failed' | 'cancelled'
export type OrchestrationNodeState = 'queued' | 'ready' | 'running' | 'completed' | 'awaiting-question' | 'failed' | 'cancelled' | 'recovery-needed'
export type FrontdoorQuestionKind = 'clarification' | 'missing-context' | 'scope-change' | 'approval-required' | 'execution-blocked' | 'conflict'
export type FrontdoorQuestionStatus = 'open' | 'answered' | 'dismissed'

export interface FrontdoorConstraints {
  allowedCapabilities: Capability[]
  maxNodes: number
  maxDepth: number
  externalSend: false
}

export interface FrontdoorRequestInput {
  requestId: string
  source: 'codex' | 'chatgpt' | 'owner' | 'test'
  objective: string
  userInput: string
  projectRef: string
  constraints: FrontdoorConstraints
  requestedOutput: string
  contextReferences: string[]
  scope: JobScope
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
  scope: JobScope
  contextReferences: string[]
  acceptance: string[]
  stopConditions: string[]
  capabilities: Capability[]
  dependsOn: string[]
  depth: number
}

export interface DecompositionPlanInput {
  planId: string
  requestId: string
  version: number
  nodes: DecompositionNode[]
  aggregationPolicy: 'collect-all' | 'stop-on-blocking-question'
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
  childResults: Array<{ nodeId: string; status: ResultStatus; resultRef?: string }>
  openQuestions: FrontdoorQuestion[]
  conflicts: string[]
  evidenceRefs: string[]
  ownerDecisionRequired: boolean
  nextAction: string
  createdAt: string
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

export type FrontdoorEventType =
  | 'frontdoor.run-created'
  | 'frontdoor.approval-bound'
  | 'frontdoor.node-started'
  | 'frontdoor.node-completed'
  | 'frontdoor.node-failed'
  | 'frontdoor.question-opened'
  | 'frontdoor.run-recovery-needed'
  | 'frontdoor.run-stopped'
  | 'frontdoor.run-completed'
  | 'frontdoor.run-snapshot'

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
