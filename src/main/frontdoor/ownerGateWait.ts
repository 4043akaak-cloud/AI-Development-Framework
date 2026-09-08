import type { FrontdoorLedgerEvent, OwnerGate, OwnerGateState, OwnerGateWaitReport, OwnerGateWaitSeverity } from '../../shared/frontdoorTypes'

/**
 * How long the Owner has been the thing a Run is waiting on.
 *
 * The Board already counted how many Runs sit at an Owner Gate. Two of them still went unnoticed
 * for eighteen and nineteen days, because a count says that something is waiting, not that it has
 * been waiting since last month. Nothing in the codebase measured elapsed time at all.
 */

/** Days, not hours: this is read at a glance, and the failure it exists to catch is measured in weeks. */
export const AGING_AFTER_DAYS = 3
export const STALE_AFTER_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

function severityFor(waitingDays: number): OwnerGateWaitSeverity {
  if (waitingDays >= STALE_AFTER_DAYS) return 'stale'
  if (waitingDays >= AGING_AFTER_DAYS) return 'aging'
  return 'fresh'
}

export function gateOf(state: OwnerGateState | undefined): OwnerGate | undefined {
  return state?.startsWith('awaiting-owner:') ? (state.slice('awaiting-owner:'.length) as OwnerGate) : undefined
}

/**
 * Which Owner gate an event moves the Run into, mirroring the replay in `eventLedger.ts`.
 *
 * The first version of this module looked for `owner-gate-opened` and found a wait for exactly one
 * Run. That event is only emitted for intake; every other gate is entered as a side effect of a
 * different event — a Result being proposed, a Node Review continuing, a question opening. The
 * nineteen-day Run reported no wait at all, which is the one case this module exists to catch.
 *
 * Keyed off the same events the replay uses, so the two cannot disagree about which gate is open.
 * `undefined` means the event does not move the Run to an Owner gate; `null` means it moves the Run
 * away from one.
 */
function gateEnteredBy(event: FrontdoorLedgerEvent): OwnerGate | null | undefined {
  const payload = event.payload as Record<string, unknown>
  switch (event.type) {
    case 'frontdoor.owner-gate-opened':
      return typeof payload.gate === 'string' ? (payload.gate as OwnerGate) : undefined
    case 'frontdoor.node-review-opened':
      return 'node-review'
    case 'frontdoor.node-review-continued':
    case 'frontdoor.question-answered':
    case 'frontdoor.run-recovery-needed':
      return 'dispatch'
    case 'frontdoor.question-opened':
      return 'question'
    case 'frontdoor.completion-proposed':
      return 'result-review'
    case 'frontdoor.result-reviewed':
      return (payload.decision as { decision?: unknown } | undefined)?.decision === 'accept' ? 'completion' : undefined
    case 'frontdoor.approval-bound':
    case 'frontdoor.run-stopped':
    case 'frontdoor.run-completed':
      return null
    default:
      return undefined
  }
}

/**
 * When the Run entered the gate it is sitting in now.
 *
 * Deliberately not `FrontdoorRunSummary.updatedAt`. On the 2-cycle Cycle 1 Run that field reads
 * `02:59:38`, the time the Run was created, while its last Owner Decision was recorded at
 * `04:17:23` — it does not track the gate at all. The Ledger is append-only and replayable, so
 * walking it is the one measurement that cannot drift.
 *
 * Walks forward and keeps the last entry into the current gate, resetting when an event moves the
 * Run away. A gate can be entered more than once — Node Review sends a Run back to `dispatch` — and
 * the newest entry is the one the Owner is actually sitting in front of.
 */
function gateOpenedAt(events: readonly FrontdoorLedgerEvent[], gate: OwnerGate): string | undefined {
  let opened: string | undefined
  for (const event of events) {
    const entered = gateEnteredBy(event)
    if (entered === undefined) continue
    if (entered === null) {
      opened = undefined
      continue
    }
    opened = entered === gate ? event.occurredAt : undefined
  }
  return opened
}

export interface OwnerGateWaitInput {
  runId: string
  ownerGate: OwnerGateState | undefined
  events: readonly FrontdoorLedgerEvent[]
  nextAction: string
  now?: Date
}

/** Returns nothing when the Run is not waiting on the Owner. Absence means "not blocked on you". */
export function assessOwnerGateWait(input: OwnerGateWaitInput): OwnerGateWaitReport | undefined {
  const gate = gateOf(input.ownerGate)
  if (!gate) return undefined

  const openedAt = gateOpenedAt(input.events, gate)
  if (!openedAt) return undefined

  const opened = Date.parse(openedAt)
  if (Number.isNaN(opened)) return undefined

  // Clamped at zero: a clock adjustment should not produce a negative wait that reads as a bug.
  const waitingMs = Math.max(0, (input.now?.getTime() ?? Date.now()) - opened)
  const waitingDays = Math.floor(waitingMs / MS_PER_DAY)

  return {
    runId: input.runId,
    gate,
    openedAt,
    waitingMs,
    waitingDays,
    nextAction: input.nextAction,
    severity: severityFor(waitingDays)
  }
}

/** Longest wait first: the one that has been ignored the longest is the one worth surfacing. */
export function sortByLongestWait(reports: readonly OwnerGateWaitReport[]): OwnerGateWaitReport[] {
  return [...reports].sort((left, right) => right.waitingMs - left.waitingMs)
}

export function longestWait(reports: readonly OwnerGateWaitReport[]): OwnerGateWaitReport | undefined {
  return sortByLongestWait(reports)[0]
}
