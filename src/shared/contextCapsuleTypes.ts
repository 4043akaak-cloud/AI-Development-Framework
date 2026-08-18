import type { AdapterRole, ResultStatus } from './jobLoopTypes'
import type { OwnerGateState, OrchestrationNodeState, OrchestrationState } from './frontdoorTypes'

export interface FrontdoorContextCapsule {
  schemaVersion: 1
  capsuleId: string
  runId: string
  generatedAt: string
  compression: {
    mode: 'deterministic'
    maxChars: number
    actualChars: number
    omittedNodeCount: number
    omittedReferenceCount: number
  }
  source: {
    requestHash: string
    planHash: string
    aggregateHash?: string
    eventCount: number
  }
  current: {
    state: OrchestrationState
    ownerGate?: OwnerGateState
    nextAction: string
  }
  request: {
    requestId: string
    objective: string
    projectRef: string
    requestedOutput: string
    contextReferences: string[]
  }
  assignments: Array<{
    nodeId: string
    role: AdapterRole
    adapterId: string
    state: OrchestrationNodeState
    resultStatus?: ResultStatus
    resultRef?: string
    resultHash?: string
  }>
  questions: Array<{
    questionId: string
    nodeId: string
    kind: string
    text: string
    blocking: boolean
    status: string
  }>
  references: {
    resultRefs: string[]
    evidenceRefs: string[]
  }
}
