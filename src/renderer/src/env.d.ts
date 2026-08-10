import type { OpenSourceResult } from '../../shared/boardTypes'
import type { ConversationThread, OwnerAction, RelayResult, ThreadSummary } from '../../shared/threadTypes'

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
    }
  }
}

export {}
