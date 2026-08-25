import type { Capability } from './jobLoopTypes'

/** Role is assigned per Phase/Task; it is never a permanent product identity. */
export type ParticipantRole = 'frontdoor' | 'specialist' | 'reviewer' | 'integrator'
export type ParticipantConnection = 'mcp' | 'cli' | 'api' | 'manual' | 'unknown'
export type ParticipantStatus = 'available' | 'planned'
export type ParticipantDataPolicy = 'local-only' | 'external-send' | 'unknown'

export interface ParticipantProfile {
  participantId: string
  displayName: string
  connection: ParticipantConnection
  status: ParticipantStatus
  roles: ParticipantRole[]
  capabilities: Capability[]
  dataPolicy: ParticipantDataPolicy
}

export interface ParticipantAssignmentProposal {
  participantId: string
  role: ParticipantRole
  capabilities: Capability[]
  assignmentId?: string
}

export interface ParticipantSubmission {
  submissionId: string
  assignmentId: string
  participantId: string
  participantRole: ParticipantRole
  runId: string
  requestId: string
  nodeId: string
  requestHash: string
  planHash: string
  targetHash: string
  assignmentHash: string
  status: 'submitted'
  summary: string
  content: string
  verification: Array<{ name: string; status: 'pass' | 'fail' | 'not-run'; reason?: string }>
  risks: string[]
  createdAt: string
}

export type ParticipantEvidenceStatus = 'awaiting-owner-review'

/** A verified but not yet accepted participant submission. It is a derived Evidence-plane view. */
export interface ParticipantEvidenceCandidate {
  evidenceId: string
  submissionRef: string
  evidenceHash: string
  status: ParticipantEvidenceStatus
  runId: string
  requestId: string
  nodeId: string
  participantId: string
  participantRole: ParticipantRole
  requestHash: string
  planHash: string
  targetHash: string
  assignmentHash: string
  summary: string
  content: string
  verification: ParticipantSubmission['verification']
  risks: string[]
  createdAt: string
  ownerNodeApproved: boolean
  ownerPacketDispatchApproved: boolean
}
