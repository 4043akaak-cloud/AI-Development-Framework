export type BoardLane = 'context-plan' | 'waiting-approval' | 'implementing' | 'verifying-review' | 'done' | 'blocked'

export type SnapshotState = 'Current' | 'Stale' | 'Broken' | 'Unconfirmed'

export interface EvidenceLink {
  label: string
  sourceId: string
}

export interface BoardCard {
  id: string
  projectId: string
  objective: string
  boardLane: BoardLane
  lifecycleStatus: string
  owner: string
  role: string
  ownerDecision: string
  riskOrBlocker: string
  stopCondition: string
  nextSafeAction: string
  taskSourceId: string
  contextSourceIds: string[]
  evidence: EvidenceLink[]
  lastConfirmed: string
  confirmedBy: string
  snapshotState: SnapshotState
}

export interface OpenSourceResult {
  ok: boolean
  reason?: 'unknown-source' | 'invalid-source' | 'outside-root' | 'unsupported-file' | 'missing-file' | 'not-a-file' | 'open-failed'
}
