import type { BoardLane } from '../../shared/boardTypes'
import type { ThreadSummary } from '../../shared/threadTypes'

/**
 * One row on the Live Board. Either a real Thread (`kind: 'thread'`) or an approved Task that has
 * no Thread yet (`kind: 'approved-task-without-thread'`). Never a write path — this module only
 * turns already-fetched Runtime Ledger data into lanes for display.
 */
export interface LiveBoardEntry {
  kind: 'thread' | 'approved-task-without-thread'
  taskId: string
  threadId?: string
  title: string
  lane: BoardLane
  /** Human-readable state, kept distinct even where several states share a lane (e.g. failed vs stopped both land in `blocked`). */
  statusLabel: string
  state?: ThreadSummary['state']
  turnCount?: number
  maxTurns?: number
  ownerActionRequired: boolean
  recoveryRequired: boolean
  recoveryReason?: string
  lastAdapterId?: string | null
  lastTurnStatus?: string | null
  updatedAt?: string
}

/**
 * `open` splits on turnCount because a freshly started Thread with no Turns yet still reads as
 * "being planned", not "in progress" — the first Turn is what actually starts implementation.
 */
export function laneForThread(thread: ThreadSummary): BoardLane {
  switch (thread.state) {
    case 'open':
      return thread.turnCount === 0 ? 'context-plan' : 'implementing'
    case 'awaiting-owner':
      return 'verifying-review'
    case 'recovery-needed':
      return 'blocked'
    case 'failed':
      return 'blocked'
    case 'stopped':
      return 'blocked'
    case 'approved':
      return 'done'
    case 'completed':
      return 'done'
    default:
      return 'blocked'
  }
}

/** Keeps `failed` and `stopped` distinguishable even though both share the `blocked` lane. */
export function statusLabelForThread(thread: ThreadSummary): string {
  if (thread.state === 'recovery-needed' && thread.recoveryReason) return `recovery-needed (${thread.recoveryReason})`
  return thread.state
}

function threadEntry(thread: ThreadSummary): LiveBoardEntry {
  return {
    kind: 'thread',
    taskId: thread.taskId,
    threadId: thread.threadId,
    title: thread.title,
    lane: laneForThread(thread),
    statusLabel: statusLabelForThread(thread),
    state: thread.state,
    turnCount: thread.turnCount,
    maxTurns: thread.maxTurns,
    ownerActionRequired: thread.ownerActionRequired,
    recoveryRequired: thread.recoveryRequired,
    recoveryReason: thread.recoveryReason,
    lastAdapterId: thread.lastAdapterId,
    lastTurnStatus: thread.lastTurnStatus,
    updatedAt: thread.updatedAt
  }
}

/**
 * An approved Task Packet exists but no Thread has been started for it yet. Shown in
 * `context-plan` alongside Threads that have no Turns yet, since neither has begun implementing.
 */
function approvedWithoutThreadEntry(taskId: string): LiveBoardEntry {
  return {
    kind: 'approved-task-without-thread',
    taskId,
    title: taskId,
    lane: 'context-plan',
    statusLabel: 'approved, thread not started',
    ownerActionRequired: false,
    recoveryRequired: false
  }
}

/**
 * The only data transform this module performs: already-fetched `ThreadSummary[]` (from
 * `window.adfRelay.listThreads()`) and already-fetched approved task IDs (from
 * `window.adfRelay.listApprovedTaskIds()`) become one flat list of Live Board entries. Every
 * approved task without a matching Thread gets its own `context-plan` entry; every Thread gets
 * exactly one entry via `laneForThread`.
 */
export function projectLiveBoard(threads: readonly ThreadSummary[], approvedTaskIds: readonly string[]): LiveBoardEntry[] {
  const taskIdsWithThread = new Set(threads.map((thread) => thread.taskId))
  const threadEntries = threads.map(threadEntry)
  const waitingEntries = approvedTaskIds.filter((taskId) => !taskIdsWithThread.has(taskId)).map(approvedWithoutThreadEntry)
  return [...threadEntries, ...waitingEntries]
}

export function liveLaneCounts(entries: readonly LiveBoardEntry[]): Record<BoardLane, number> {
  const counts: Record<BoardLane, number> = { 'context-plan': 0, 'waiting-approval': 0, implementing: 0, 'verifying-review': 0, done: 0, blocked: 0 }
  for (const entry of entries) counts[entry.lane] += 1
  return counts
}
