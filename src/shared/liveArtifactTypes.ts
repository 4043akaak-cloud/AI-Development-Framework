import type { AdapterRunStatus } from './jobLoopTypes'

export type LiveArtifactStatus = 'available' | 'not-generated' | 'broken' | 'not-applicable'

export interface LiveResultArtifact {
  turnId: string
  adapterId: string
  role: string
  status: AdapterRunStatus
  artifactStatus: Exclude<LiveArtifactStatus, 'not-generated' | 'not-applicable'>
  reference: string
  hash?: string
  summary?: string
  content?: string
  verification?: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks?: string[]
  issue?: string
  createdAt: string
}

export interface LiveEvidenceArtifact {
  artifactStatus: Exclude<LiveArtifactStatus, 'not-applicable'>
  reference: string
  hash?: string
  turnCount: number
  issue?: string
}

export interface LiveWorkPlaneArtifact {
  artifactStatus: LiveArtifactStatus
  note: string
}

export interface LiveArtifactInspection {
  threadId: string
  taskId: string
  jobId: string
  threadState: string
  results: LiveResultArtifact[]
  evidence: LiveEvidenceArtifact
  workPlane: LiveWorkPlaneArtifact
}
