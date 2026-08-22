import type { OpenSourceResult } from '../../shared/boardTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../../shared/threadTypes'
import type { LiveArtifactInspection } from '../../shared/liveArtifactTypes'
import type { ExternalPreflight, OllamaReadiness } from '../../shared/externalAdapterTypes'
import type { AdapterProfile } from '../../shared/jobLoopTypes'
import type { FrontdoorInspection, FrontdoorPlanProposal, FrontdoorPrepareInput, FrontdoorPrepareResult, FrontdoorRequestInput, FrontdoorReturn, FrontdoorRunSummary, OwnerDecisionEnvelope, OwnerGate, OrchestrationRun, WorkPlaneArtifactManifest } from '../../shared/frontdoorTypes'

declare global {
  interface Window {
    adfBoard: {
      openCanonicalSource: (sourceId: string) => Promise<OpenSourceResult>
    }
    adfRelay: {
      listApprovedTaskIds: () => Promise<RelayResult<string[]>>
      listThreads: () => Promise<RelayResult<ThreadSummary[]>>
      getThread: (threadId: string) => Promise<RelayResult<ConversationThread>>
      inspectLiveArtifacts: (threadId: string) => Promise<RelayResult<LiveArtifactInspection>>
      startThread: (taskId: string) => Promise<RelayResult<ConversationThread>>
      sendFirstTurn: (threadId: string) => Promise<RelayResult<ConversationThread>>
      continueThread: (threadId: string, note?: string) => Promise<RelayResult<ConversationThread>>
      decideThread: (threadId: string, action: Exclude<OwnerAction, 'continue'>, note?: string) => Promise<RelayResult<ConversationThread>>
      recoverThread: (threadId: string, action: RecoveryAction, note?: string) => Promise<RelayResult<ConversationThread>>
      preflightExternal: (threadId: string, adapterId: string) => Promise<RelayResult<ExternalPreflight>>
      sendExternal: (threadId: string, adapterId: string) => Promise<RelayResult<ConversationThread>>
      cancelExternal: (threadId: string, note?: string) => Promise<RelayResult<{ cancelled: boolean }>>
      externalSendState: (threadId: string) => Promise<RelayResult<{ inFlight: boolean }>>
      listExternalAdapters: () => Promise<RelayResult<AdapterProfile[]>>
      // Owner-explicit only: never call from mount, Thread selection, or a polling loop.
      ollamaReadiness: () => Promise<RelayResult<OllamaReadiness>>
    }
    adfFrontdoor: {
      list: () => Promise<RelayResult<FrontdoorRunSummary[]>>
      proposePlan: (input: FrontdoorRequestInput) => Promise<RelayResult<FrontdoorPlanProposal>>
      prepare: (input: FrontdoorPrepareInput) => Promise<RelayResult<FrontdoorPrepareResult>>
      inspect: (runId: string) => Promise<RelayResult<FrontdoorInspection>>
      approve: (input: { runId: string; gate: OwnerGate; approvedBy: string; note?: string; nodeIds?: string[] }) => Promise<RelayResult<OwnerDecisionEnvelope>>
      dispatch: (runId: string) => Promise<RelayResult<FrontdoorReturn>>
      reviewNode: (input: { runId: string; nodeId: string; approvedBy: string; decision: 'continue' | 'stop'; note?: string }) => Promise<RelayResult<{ decision: OwnerDecisionEnvelope; execution?: FrontdoorReturn }>>
      answer: (input: { runId: string; questionId: string; approvedBy: string; answerRef?: string; note?: string }) => Promise<RelayResult<OwnerDecisionEnvelope>>
      reviewResult: (input: { runId: string; approvedBy: string; decision: 'accept' | 'follow-up' | 'reject'; note?: string }) => Promise<RelayResult<OwnerDecisionEnvelope>>
      complete: (input: { runId: string; approvedBy: string; note?: string }) => Promise<RelayResult<OrchestrationRun>>
      exportArtifact: (input: { runId: string; approvedBy: string; note?: string }) => Promise<RelayResult<WorkPlaneArtifactManifest>>
      stop: (input: { runId: string; approvedBy: string; note?: string }) => Promise<RelayResult<OrchestrationRun>>
      recover: (runId: string) => Promise<RelayResult<OrchestrationRun>>
      listCandidates: () => Promise<RelayResult<import('../../shared/implementationTypes').CandidateSummary[]>>
      inspectCandidate: (candidateId: string) => Promise<RelayResult<import('../../shared/implementationTypes').CandidateInspectionResult>>
      startCandidateReview: (candidateId: string) => Promise<RelayResult<import('../../shared/implementationTypes').CandidateReviewStartedResult>>
      reviewCandidate: (input: import('../../shared/implementationTypes').CandidateReviewDecisionInput) => Promise<RelayResult<import('../../shared/implementationTypes').CandidateReviewOwnerDecisionEnvelope>>
    }
  }
}


export {}
