import { contextBridge, ipcRenderer } from 'electron'
import type { OpenSourceResult } from '../shared/boardTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../shared/threadTypes'
import type { ExternalPreflight, OllamaReadiness } from '../shared/externalAdapterTypes'
import type { AdapterProfile } from '../shared/jobLoopTypes'

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
