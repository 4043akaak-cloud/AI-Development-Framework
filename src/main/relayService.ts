import path from 'node:path'
import { readdir } from 'node:fs/promises'
import type { ApprovedTaskPacket } from '../shared/jobLoopTypes'
import type { ExternalPreflight } from '../shared/externalAdapterTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../shared/threadTypes'
import { readJson } from './jobLoop/ledger'
import type { ConversationRelay } from './jobLoop/relay'

const ownerActions: readonly OwnerAction[] = ['continue', 'stop', 'approve', 'next-task']

/**
 * Owner-approved Task Packets live on disk and are placed there outside the renderer.
 * The renderer can only name an existing taskId, so it cannot invent an approval.
 */
export function approvedTaskDirectory(relay: ConversationRelay): string {
  return path.join(relay.runtimeRoot, 'approved-tasks')
}

function asIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(value)) throw new Error(`invalid ${label}`)
  return value
}

function asOwnerAction(value: unknown): OwnerAction {
  if (typeof value !== 'string' || !ownerActions.includes(value as OwnerAction)) throw new Error('invalid owner action')
  return value as OwnerAction
}

function asNote(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || value.length > 400) throw new Error('invalid note')
  return value
}

async function guard<T>(run: () => Promise<T>): Promise<RelayResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

async function loadApprovedPacket(relay: ConversationRelay, taskId: string): Promise<ApprovedTaskPacket> {
  const file = path.join(approvedTaskDirectory(relay), `${taskId}.json`)
  try {
    return await readJson<ApprovedTaskPacket>(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`no approved Task Packet for ${taskId}. Place the Owner-approved packet at approved-tasks/${taskId}.json before starting a Thread.`)
    }
    throw error
  }
}

export function listApprovedTaskIds(relay: ConversationRelay): Promise<RelayResult<string[]>> {
  return guard(async () => {
    try {
      const entries = await readdir(approvedTaskDirectory(relay), { withFileTypes: true })
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name.replace(/\.json$/, '')).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  })
}

export function listThreads(relay: ConversationRelay): Promise<RelayResult<ThreadSummary[]>> {
  return guard(() => relay.listThreads())
}

export function getThread(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => relay.getConversationState(asIdentifier(threadId, 'threadId')))
}

/** Starts a Thread only for a Task that already has an Owner-approved packet on disk. */
export function startApprovedThread(relay: ConversationRelay, taskId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(async () => relay.startThread(await loadApprovedPacket(relay, asIdentifier(taskId, 'taskId'))))
}

/** Sends the first Turn of an `open` Thread. */
export function sendFirstTurn(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => relay.continueJob(asIdentifier(threadId, 'threadId')))
}

/** One Owner action: approve continuation and add the next Turn. */
export function continueThread(relay: ConversationRelay, threadId: unknown, note: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => relay.continueWithOwnerApproval(asIdentifier(threadId, 'threadId'), asNote(note)))
}

const recoveryActions: readonly RecoveryAction[] = ['resend', 'record-failure', 'stop']

function asRecoveryAction(value: unknown): RecoveryAction {
  if (typeof value !== 'string' || !recoveryActions.includes(value as RecoveryAction)) throw new Error('invalid recovery action')
  return value as RecoveryAction
}

/** One startup pass. Detects interrupted sends; never resends or fails anything on its own. */
export function scanForRecovery(relay: ConversationRelay): Promise<RelayResult<ThreadSummary[]>> {
  return guard(() => relay.scanForRecovery())
}

export function recoverThread(relay: ConversationRelay, threadId: unknown, action: unknown, note: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => {
    const id = asIdentifier(threadId, 'threadId')
    const safeNote = asNote(note)
    switch (asRecoveryAction(action)) {
      case 'resend':
        return relay.resendFromRecovery(id, safeNote)
      case 'record-failure':
        return relay.recordRecoveryFailure(id, safeNote)
      default:
        return relay.stopFromRecovery(id, safeNote)
    }
  })
}

/**
 * Read-only Owner gate report. Opens no connection: it only reads Thread state, the Registry and
 * the Owner approval file. The renderer cannot create or edit that file through any IPC.
 */
export function preflightExternal(relay: ConversationRelay, threadId: unknown, adapterId: unknown): Promise<RelayResult<ExternalPreflight>> {
  return guard(() => relay.preflightExternalSend(asIdentifier(threadId, 'threadId'), asIdentifier(adapterId, 'adapterId')))
}

/**
 * One external send, on one explicit Owner action. The gate runs again inside the Adapter, so a
 * stale preflight in the UI cannot authorise anything. No retry and no fallback.
 */
export function sendExternal(relay: ConversationRelay, threadId: unknown, adapterId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(async () => {
    const id = asIdentifier(threadId, 'threadId')
    const adapter = asIdentifier(adapterId, 'adapterId')
    const preflight = await relay.preflightExternalSend(id, adapter)
    if (!preflight.ok) throw new Error(`external send blocked: ${preflight.blockingReasons.join('; ')}`)
    return relay.continueJob(id, adapter)
  })
}

export function cancelExternal(relay: ConversationRelay, threadId: unknown, note: unknown): Promise<RelayResult<{ cancelled: boolean }>> {
  return guard(async () => ({ cancelled: relay.cancelExternalSend(asIdentifier(threadId, 'threadId'), asNote(note) ?? 'cancelled by Owner') }))
}

export function externalSendState(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<{ inFlight: boolean }>> {
  return guard(async () => ({ inFlight: relay.hasInFlightExternalSend(asIdentifier(threadId, 'threadId')) }))
}

export function decideThread(relay: ConversationRelay, threadId: unknown, action: unknown, note: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => {
    const action_ = asOwnerAction(action)
    if (action_ === 'continue') throw new Error('use continueThread so that continue is a single Owner action')
    return relay.recordOwnerDecision(asIdentifier(threadId, 'threadId'), action_, asNote(note))
  })
}
