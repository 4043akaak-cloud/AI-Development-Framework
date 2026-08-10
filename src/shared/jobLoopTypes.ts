export type JobState = 'queued' | 'running' | 'awaiting-review' | 'failed' | 'cancelled' | 'recovery-needed'
export type ResultStatus = 'success' | 'partial' | 'failed' | 'invalid'
export type Capability = 'read' | 'propose'
export type FixtureMode = 'success' | 'partial' | 'failed' | 'invalid'
export type DispatchState = 'dispatched' | 'acknowledged' | 'preflight-valid' | 'blocked'
export type AdapterConnection = 'fake' | 'cli' | 'api' | 'manual' | 'unknown'
export type AdapterStatus = 'available' | 'planned'
export type AdapterRole = 'proposal' | 'critic' | 'implementation' | 'review' | 'research'
export type AdapterCostTier = 'free' | 'low' | 'medium' | 'high' | 'unknown'
export type AdapterDataPolicy = 'local-only' | 'external-send' | 'unknown'
export type AdapterRunStatus = ResultStatus | 'timeout' | 'cancelled'

export interface JobScope {
  inScope: string[]
  outOfScope: string[]
}

export interface JobContext {
  githubTask: string
  obsidianContext: string[]
  adoptedPrinciples: string[]
}

export interface DispatchTarget {
  repository: string
  branch: string
  worktree: string
  allowedFiles: string[]
  forbiddenChanges: string[]
}

export interface AdapterProfile {
  adapterId: string
  displayName: string
  connection: AdapterConnection
  status: AdapterStatus
  roles: AdapterRole[]
  capabilities: Capability[]
  costTier: AdapterCostTier
  dataPolicy: AdapterDataPolicy
}

export interface AdapterSelection {
  adapterId: string
  role: AdapterRole
  rationale: string
}

export interface AdapterPlan {
  version: 'v1'
  selections: AdapterSelection[]
  externalSend: false
  maxCostTier: AdapterCostTier
}

export interface Approval {
  approvalId: string
  taskId: string
  status: 'active' | 'revoked' | 'expired'
  approvedBy: string
  approvedAt: string
  expiresAt: string
  scopeHash: string
  routingPlanHash: string
  capabilities: Capability[]
}

export interface ApprovedTaskPacket {
  taskId: string
  objective: string
  scope: JobScope
  scopeHash: string
  context: JobContext
  contextHash: string
  acceptance: string[]
  stopConditions: string[]
  approval: Approval
  adapter: string
  fixtureMode: FixtureMode
  target: DispatchTarget
  adapterPlan: AdapterPlan
}

export interface DispatchPacket {
  dispatchId: string
  taskId: string
  packetHash: string
  scopeHash: string
  contextHash: string
  target: DispatchTarget
  capabilities: Capability[]
  acceptance: string[]
  stopConditions: string[]
  adapter: ApprovedTaskPacket['adapter']
  adapterPlan: AdapterPlan
}

export interface DispatchAck {
  dispatchId: string
  taskId: string
  packetHash: string
  acceptedScopeHash: string
  acceptedCapabilities: Capability[]
  target: DispatchTarget
  status: 'acknowledged' | 'rejected'
  receivedAt: string
  reason?: string
}

export interface DebateArtifact {
  artifactId: string
  adapter: string
  role: 'proposal' | 'critic'
  status: 'success' | 'failed' | 'invalid'
  createdAt: string
  respondsToArtifact?: string
  respondsToHash?: string
  proposal?: string
  critique?: string
  changes: string[]
  verification: Array<{ name: string; status: 'pass' | 'fail'; reason?: string }>
}

export interface DebateParticipant {
  adapter: string
  role: 'proposal' | 'critic'
  artifactId?: string
  hash: string
  respondsToHash?: string
}

export interface AdapterRunRecord {
  resultId: string
  adapterId: string
  role: AdapterRole
  inputHash: string
  resultHash: string
  status: AdapterRunStatus
  artifactId?: string
  terminationReason: string
  createdAt: string
}

export interface DebateResult {
  resultId: string
  jobId: string
  taskId: string
  status: ResultStatus
  inputHash: string
  scopeHash: string | null
  contextHash: string | null
  adapter: string
  adapterPlan: AdapterPlan
  adapterRuns: AdapterRunRecord[]
  role: 'debate-run'
  createdAt: string
  debate: {
    rounds: number
    participants: DebateParticipant[]
    proposal?: string
    critique?: string
  }
  changes: string[]
  verification: Array<Record<string, unknown>>
  risks: string[]
  ownerDecisionRequired: boolean
  nextOwnerDecision: string
}

export interface JobRequest {
  jobId: string
  dispatchKey: string
  inputHash: string
  createdAt: string
  task: Pick<ApprovedTaskPacket, 'taskId' | 'objective' | 'scope' | 'scopeHash' | 'context' | 'contextHash' | 'acceptance' | 'stopConditions' | 'adapter' | 'fixtureMode' | 'target' | 'adapterPlan'>
}

export interface JobEvent {
  type: string
  at: string
  jobId?: string
  taskId?: string
  state?: JobState
  from?: JobState
  to?: JobState
  [key: string]: unknown
}

export interface JobRecord {
  jobId: string
  state: JobState
  request: JobRequest
  events: JobEvent[]
  result: DebateResult | null
  dispatchState: DispatchState
  packetHash: string
}

export interface BoardCard {
  taskId: string
  jobId: string
  objective: string
  boardLane: JobState | 'owner-review'
  formalLifecycle: string
  ownerDecision: string
  resultStatus: ResultStatus | null
  evidence: string | null
  taskReference: string
  contextReferences: string[]
  lastUpdated: string | null
  sourceState: 'Current' | 'Stale' | 'Broken' | 'Unconfirmed'
  dispatchState: DispatchState
  packetHash: string
}

export interface BoardProjection {
  generatedAt: string
  source: 'ADF Local Ledger'
  readOnly: true
  cards: BoardCard[]
}
