import type { OpenSourceResult } from '../../shared/boardTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../../shared/threadTypes'
import type { ExternalPreflight, OllamaReadiness } from '../../shared/externalAdapterTypes'
import type { AdapterProfile } from '../../shared/jobLoopTypes'

declare global {
  interface Window {
    adfBoard: {
      openCanonicalSource: (sourceId: string) => Promise<OpenSourceResult>
    }
    adfRelay: {
      listApprovedTaskIds: () => Promise<RelayResult<string[]>>
      listThreads: () => Promise<RelayResult<ThreadSummary[]>>
      getThread: (threadId: string) => Promise<RelayResult<ConversationThread>>
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
  }
}

export {}
