import type { AdapterRole, Capability } from './jobLoopTypes'

export interface ImplementationSourceBinding {
  parentRunId: string
  parentRequestId: string
  parentRequestHash: string
  parentPlanHash: string
  sourceNodeId: string
  sourceAggregateRef: string
  sourceAggregateHash: string
  parentReviewDecisionId: string
  parentReviewTargetHash: string
  parentReviewExpiresAt: string
  sourceTaskId: string
  sourceJobId: string
  sourceThreadId: string
  sourceResultRef: string
  sourceResultHash: string
  sourceEvidenceRef: string
  sourceEvidenceHash: string
  contextBundleHash: string
  capabilityGrantHash: string
  bindingHash: string
}
export interface CandidateFile {
  relativePath: string
  content: string
  contentHash: string
}

export interface ImplementationCandidate {
  kind: 'candidate-file-set'
  baseSnapshotHash: string
  files: CandidateFile[]
  candidateHash: string
}

export interface ImplementationAgentRequest {
  taskId: string
  runId: string
  nodeId: string
  role: AdapterRole
  capabilities: readonly Capability[]
  dataPolicy: 'local-only'
  source: ImplementationSourceBinding
  allowedFiles: readonly string[]
}

export type CandidateReviewState = 'generated' | 'owner-review' | 'accepted' | 'rejected' | 'follow-up'

export interface CandidateSummary {
  candidateId: string
  parentRunId: string
  childRunId: string
  candidateHash: string
  fileCount: number
  totalBytes: number
  state: CandidateReviewState
  exportedAt: string
}

export interface CandidateInspectionResult {
  summary: CandidateSummary
  candidate: ImplementationCandidate
  binding: ImplementationSourceBinding
  manifest: Record<string, unknown>
  state: CandidateReviewState
  targetHash: string
}


export interface CandidateReviewStartedResult {
  candidateId: string
  state: 'owner-review'
  startedAt: string
}

export interface CandidateReviewDecisionInput {
  candidateId: string
  decision: 'accept' | 'reject' | 'follow-up'
  approvedBy: string
  targetHash: string
  note?: string
}

export interface CandidateReviewOwnerDecisionEnvelope {
  decisionId: string
  runId: string
  requestId: string
  taskId: string
  candidateId: string
  candidateHash: string
  targetHash: string
  approvedBy: string
  capability: 'candidate-review'
  decidedAt: string
  expiresAt: string
  decision: 'accept' | 'reject' | 'follow-up'
  note?: string
}
