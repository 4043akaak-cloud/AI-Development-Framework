import { contextBridge, ipcRenderer } from 'electron'
import type { OpenSourceResult } from '../shared/boardTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../shared/threadTypes'

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
  recoverThread: (threadId: string, action: RecoveryAction, note?: string): Promise<RelayResult<ConversationThread>> => ipcRenderer.invoke('relay:recover', threadId, action, note ?? null)
})
