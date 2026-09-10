import path from 'node:path'
import { readdir } from 'node:fs/promises'
import type { AdapterProfile, ApprovedTaskPacket } from '../shared/jobLoopTypes'
import type { ExternalPreflight, LocalModelReadiness, OllamaReadiness } from '../shared/externalAdapterTypes'
import type { ConversationThread, OwnerAction, RecoveryAction, RelayResult, ThreadSummary } from '../shared/threadTypes'
import type { LiveArtifactInspection } from '../shared/liveArtifactTypes'
import { readJson } from './jobLoop/ledger'
import type { ConversationRelay } from './jobLoop/relay'
import { checkOllamaReadiness } from './jobLoop/ollamaTransport'
import { inspectThreadArtifacts } from './jobLoop/liveArtifacts'

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

/**
 * The standalone Packets an Owner can start a Thread from. Frontdoor child Packets are excluded:
 * `startApprovedThread` refuses them, so listing them would only offer the Owner a choice that
 * always fails, and would present a Run's own Node as if it were startable outside its Gate.
 */
export function listApprovedTaskIds(relay: ConversationRelay): Promise<RelayResult<string[]>> {
  return guard(async () => {
    let entries
    try {
      entries = await readdir(approvedTaskDirectory(relay), { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const taskIds: string[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const taskId = entry.name.replace(/\.json$/, '')
      try {
        // An unreadable Packet is skipped rather than thrown on: it cannot be started either way,
        // and one malformed file must not hide every other Packet from the Owner.
        if ((await loadApprovedPacket(relay, taskId)).frontdoorBinding) continue
      } catch {
        continue
      }
      taskIds.push(taskId)
    }
    return taskIds.sort()
  })
}

export function listThreads(relay: ConversationRelay): Promise<RelayResult<ThreadSummary[]>> {
  return guard(() => relay.listThreads())
}

export function getThread(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => relay.getConversationState(asIdentifier(threadId, 'threadId')))
}

/** Read-only, hash- and binding-checked Result/Evidence view for a completed Live Board Thread. */
export function inspectLiveArtifacts(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<LiveArtifactInspection>> {
  return guard(async () => {
    const thread = await relay.getConversationState(asIdentifier(threadId, 'threadId'))
    return inspectThreadArtifacts(relay.runtimeRoot, thread)
  })
}

/** Starts a Thread only for a Task that already has an Owner-approved packet on disk. */
/**
 * The generic Thread entrance. It starts a Thread from a Packet in `approved-tasks/` without
 * consulting any Frontdoor Decision, which was safe only while every Packet there had been placed
 * by hand by the Owner.
 *
 * ADF now derives Frontdoor child Packets into that same directory. Today they cannot be reached
 * here anyway: `asIdentifier` above forbids `:` and every child taskId is `<requestId>::<nodeId>`.
 * That is protection by coincidence — it holds only while both the identifier shape and the
 * childTaskId convention stay exactly as they are, and neither was written to defend this.
 *
 * So the rule is stated rather than relied upon: a Packet carrying a `frontdoorBinding` belongs to
 * a Run and is refused here, because starting one as a standalone Thread would execute a Frontdoor
 * Node with no Dispatch Decision at all. The Frontdoor path calls `relay.startThread` directly
 * after `assertDispatchApproved`, so it is unaffected.
 */
export function startApprovedThread(relay: ConversationRelay, taskId: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(async () => {
    const packet = await loadApprovedPacket(relay, asIdentifier(taskId, 'taskId'))
    if (packet.frontdoorBinding) throw new Error(`this Packet belongs to Frontdoor Run ${packet.frontdoorBinding.runId} and must be dispatched through its Dispatch Gate, not started as a standalone Thread`)
    return relay.startThread(packet)
  })
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
    await relay.assertAdapterReadyForDispatch(adapter)
    return relay.continueJob(id, adapter)
  })
}

export function cancelExternal(relay: ConversationRelay, threadId: unknown, note: unknown): Promise<RelayResult<{ cancelled: boolean }>> {
  return guard(async () => ({ cancelled: relay.cancelExternalSend(asIdentifier(threadId, 'threadId'), asNote(note) ?? 'cancelled by Owner') }))
}

export function externalSendState(relay: ConversationRelay, threadId: unknown): Promise<RelayResult<{ inFlight: boolean }>> {
  return guard(async () => ({ inFlight: relay.hasInFlightExternalSend(asIdentifier(threadId, 'threadId')) }))
}

/** Read-only, Registry-derived candidates for explicit external dispatch. Opens no connection. */
export function listExternalAdapters(relay: ConversationRelay): Promise<RelayResult<AdapterProfile[]>> {
  return guard(async () => relay.listExternalAdapterProfiles())
}

/**
 * Owner-explicit only. The one IPC in this file that actually reaches a network endpoint
 * (`/api/tags`, read-only) — callers must never invoke it from startup, Thread selection, or a
 * polling loop.
 */
export function ollamaReadiness(): Promise<RelayResult<OllamaReadiness>> {
  return guard(() => checkOllamaReadiness())
}

/** Owner-explicit only. Checks the selected registered local model Adapter; never polls. */
export function localReadiness(relay: ConversationRelay, adapterId: unknown): Promise<RelayResult<LocalModelReadiness>> {
  return guard(() => relay.localReadiness(asIdentifier(adapterId, 'adapterId')))
}

export function decideThread(relay: ConversationRelay, threadId: unknown, action: unknown, note: unknown): Promise<RelayResult<ConversationThread>> {
  return guard(() => {
    const action_ = asOwnerAction(action)
    if (action_ === 'continue') throw new Error('use continueThread so that continue is a single Owner action')
    return relay.recordOwnerDecision(asIdentifier(threadId, 'threadId'), action_, asNote(note))
  })
}
