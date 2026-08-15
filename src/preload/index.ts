import { contextBridge, ipcRenderer } from 'electron'
import type { OpenSourceResult } from '../shared/boardTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../shared/threadTypes'
import type { ExternalPreflight, OllamaReadiness } from '../shared/externalAdapterTypes'
import type { AdapterProfile } from '../shared/jobLoopTypes'
import type { FrontdoorInspection, FrontdoorPlanProposal, FrontdoorPrepareInput, FrontdoorPrepareResult, FrontdoorRequestInput, FrontdoorReturn, FrontdoorRunSummary, OwnerDecisionEnvelope, OwnerGate, OrchestrationRun, WorkPlaneArtifactManifest } from '../shared/frontdoorTypes'

contextBridge.exposeInMainWorld('adfBoard', {
  openCanonicalSource: (sourceId: string): Promise<OpenSourceResult> => ipcRenderer.invoke('board:open-canonical-source', sourceId)
})

contextBridge.exposeInMainWorld('adfRelay', {
  listApprovedTaskIds: (): Promise<RelayResult<string[]>> => ipcRenderer.invoke('relay:approved-tasks'),
  listThreads: (): Promise<RelayResult<ThreadSummary[]>> => ipcRenderer.invoke('relay:list'),
  getThread: (threadId: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:get', threadId),
  startThread: (taskId: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:start', taskId),
  sendFirstTurn: (threadId: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:send-first', threadId),
  continueThread: (threadId: string, note?: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:continue', threadId, note ?? null),
  decideThread: (threadId: string, action: Exclude<OwnerAction, 'continue'>, note?: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:decide', threadId, action, note ?? null),
  recoverThread: (threadId: string, action: RecoveryAction, note?: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:recover', threadId, action, note ?? null),
  // No approval-writing channel is exposed: the renderer can read the gate, never grant it.
  preflightExternal: (threadId: string, adapterId: string): Promise<RelayResult<ExternalPreflight>> => ipcRenderer.invoke('relay:preflight-external', threadId, adapterId),
  sendExternal: (threadId: string, adapterId: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:send-external', threadId, adapterId),
  cancelExternal: (threadId: string, note?: string): Promise<RelayResult<{ cancelled: boolean }>> => ipcRenderer.invoke('relay:cancel-external', threadId, note ?? null),
  externalSendState: (threadId: string): Promise<RelayResult<{ inFlight: boolean }>> => ipcRenderer.invoke('relay:external-state', threadId),
  listExternalAdapters: (): Promise<RelayResult<AdapterProfile[]>> => ipcRenderer.invoke('relay:external-adapters'),
  // Owner-explicit only: the renderer must call this only from a direct click handler.
  ollamaReadiness: (): Promise<RelayResult<OllamaReadiness>> => ipcRenderer.invoke('relay:ollama-readiness')
})

contextBridge.exposeInMainWorld('adfFrontdoor', {
  list: (): Promise<RelayResult<FrontdoorRunSummary[]>> => ipcRenderer.invoke('frontdoor:list'),
  proposePlan: (input: FrontdoorRequestInput): Promise<RelayResult<FrontdoorPlanProposal>> => ipcRenderer.invoke('frontdoor:propose-plan', input),
  prepare: (input: FrontdoorPrepareInput): Promise<RelayResult<FrontdoorPrepareResult>> => ipcRenderer.invoke('frontdoor:prepare', input),
  inspect: (runId: string): Promise<RelayResult<FrontdoorInspection>> => ipcRenderer.invoke('frontdoor:inspect', runId),
  approve: (input: { runId: string; gate: OwnerGate; approvedBy: string; note?: string; nodeIds?: string[] }): Promise<RelayResult<OwnerDecisionEnvelope>> => ipcRenderer.invoke('frontdoor:approve', input),
  dispatch: (runId: string): Promise<RelayResult<FrontdoorReturn>> => ipcRenderer.invoke('frontdoor:dispatch', runId),
  reviewNode: (input: { runId: string; nodeId: string; approvedBy: string; decision: 'continue' | 'stop'; note?: string }): Promise<RelayResult<{ decision: OwnerDecisionEnvelope; execution?: FrontdoorReturn }>> => ipcRenderer.invoke('frontdoor:review-node', input),
  answer: (input: { runId: string; questionId: string; approvedBy: string; answerRef?: string; note?: string }): Promise<RelayResult<OwnerDecisionEnvelope>> => ipcRenderer.invoke('frontdoor:answer', input),
  reviewResult: (input: { runId: string; approvedBy: string; decision: 'accept' | 'follow-up' | 'reject'; note?: string }): Promise<RelayResult<OwnerDecisionEnvelope>> => ipcRenderer.invoke('frontdoor:review-result', input),
  complete: (input: { runId: string; approvedBy: string; note?: string }): Promise<RelayResult<OrchestrationRun>> => ipcRenderer.invoke('frontdoor:complete', input),
  exportArtifact: (input: { runId: string; approvedBy: string; note?: string }): Promise<RelayResult<WorkPlaneArtifactManifest>> => ipcRenderer.invoke('frontdoor:export-artifact', input),
  stop: (input: { runId: string; approvedBy: string; note?: string }): Promise<RelayResult<OrchestrationRun>> => ipcRenderer.invoke('frontdoor:stop', input),
  recover: (runId: string): Promise<RelayResult<OrchestrationRun>> => ipcRenderer.invoke('frontdoor:recover', runId)
})
