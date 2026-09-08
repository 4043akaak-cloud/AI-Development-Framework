import { describe, expect, it } from 'vitest'
import { AGING_AFTER_DAYS, STALE_AFTER_DAYS, assessOwnerGateWait, gateOf, longestWait, sortByLongestWait } from '../src/main/frontdoor/ownerGateWait'
import type { FrontdoorLedgerEvent, OwnerGate } from '../src/shared/frontdoorTypes'

function gateOpened(gate: OwnerGate, occurredAt: string, sequence = 0): FrontdoorLedgerEvent {
  return {
    schemaVersion: 1,
    sequence,
    eventId: `event-${sequence}`,
    runId: 'run-1',
    occurredAt,
    previousEventHash: '',
    eventHash: '',
    type: 'frontdoor.owner-gate-opened',
    payload: { gate }
  }
}

function otherEvent(occurredAt: string, sequence: number): FrontdoorLedgerEvent {
  return { ...gateOpened('intake', occurredAt, sequence), type: 'frontdoor.owner-decision-recorded', payload: {} }
}

function resultReviewed(decision: string, occurredAt: string, sequence = 0): FrontdoorLedgerEvent {
  return { ...gateOpened('intake', occurredAt, sequence), type: 'frontdoor.result-reviewed', payload: { decision: { decision } } }
}

function typed(type: FrontdoorLedgerEvent['type'], occurredAt: string, sequence: number, payload: Record<string, unknown> = {}): FrontdoorLedgerEvent {
  return { ...gateOpened('intake', occurredAt, sequence), type, payload }
}

const now = new Date('2026-09-09T00:00:00.000Z')

describe('assessOwnerGateWait', () => {
  it('says nothing when the Run is not waiting on the Owner', () => {
    expect(assessOwnerGateWait({ runId: 'run-1', ownerGate: 'completed', events: [], nextAction: '', now })).toBeUndefined()
    expect(assessOwnerGateWait({ runId: 'run-1', ownerGate: 'running', events: [], nextAction: '', now })).toBeUndefined()
    expect(assessOwnerGateWait({ runId: 'run-1', ownerGate: undefined, events: [], nextAction: '', now })).toBeUndefined()
  })

  /**
   * The two Runs that went unnoticed. Cycle 1 is the reason this module exists: the Board counted it
   * as "waiting" the whole time and nobody could tell that the whole time was nineteen days.
   */
  it('measures the real Runs that sat unnoticed', () => {
    const cycle1 = assessOwnerGateWait({
      runId: 'run-7987794137baa1041b91',
      ownerGate: 'awaiting-owner:completion',
      events: [resultReviewed('accept', '2026-08-21T04:17:23.747Z')],
      nextAction: 'OwnerがこのRunのCompletionを確認します。',
      now
    })
    expect(cycle1?.waitingDays).toBe(18)
    // Not 02:59:38 — that is `updatedAt`, the Run's creation time, which never tracked the gate.
    expect(cycle1?.openedAt).toBe('2026-08-21T04:17:23.747Z')
    expect(cycle1?.severity).toBe('stale')
    expect(cycle1?.gate).toBe('completion')

    const reintake = assessOwnerGateWait({
      runId: 'run-113f864f003c8caaf2cb',
      ownerGate: 'awaiting-owner:intake',
      events: [gateOpened('intake', '2026-08-22T12:32:30.867Z')],
      nextAction: 'OwnerがIntakeを確認します。',
      now
    })
    expect(reintake?.waitingDays).toBe(17)
    expect(reintake?.severity).toBe('stale')
  })

  /**
   * A gate can reopen — Node Review sends a Run back to `dispatch`. Measuring from the first opening
   * would report a wait the Owner already answered.
   */
  it('measures from the newest opening of the current gate, not the first', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:dispatch',
      events: [
        gateOpened('dispatch', '2026-08-01T00:00:00.000Z', 0),
        otherEvent('2026-09-07T00:00:00.000Z', 1),
        gateOpened('dispatch', '2026-09-08T00:00:00.000Z', 2)
      ],
      nextAction: '',
      now
    })
    expect(report?.openedAt).toBe('2026-09-08T00:00:00.000Z')
    expect(report?.waitingDays).toBe(1)
  })

  it('ignores openings of a different gate', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:completion',
      events: [gateOpened('intake', '2026-09-08T00:00:00.000Z', 0), gateOpened('completion', '2026-09-06T00:00:00.000Z', 1)],
      nextAction: '',
      now
    })
    expect(report?.waitingDays).toBe(3)
  })


  /**
   * `owner-gate-opened` is emitted for intake only. Keying off it alone made the nineteen-day Run
   * report no wait at all — the exact case this module exists to catch.
   */
  it('recognises every event the ledger replay uses to open a gate', () => {
    const cases: Array<[FrontdoorLedgerEvent, OwnerGate]> = [
      [typed('frontdoor.node-review-opened', '2026-09-06T00:00:00.000Z', 1), 'node-review'],
      [typed('frontdoor.node-review-continued', '2026-09-06T00:00:00.000Z', 1), 'dispatch'],
      [typed('frontdoor.question-answered', '2026-09-06T00:00:00.000Z', 1), 'dispatch'],
      [typed('frontdoor.run-recovery-needed', '2026-09-06T00:00:00.000Z', 1), 'dispatch'],
      [typed('frontdoor.question-opened', '2026-09-06T00:00:00.000Z', 1), 'question'],
      [typed('frontdoor.completion-proposed', '2026-09-06T00:00:00.000Z', 1), 'result-review']
    ]
    for (const [event, gate] of cases) {
      const report = assessOwnerGateWait({
        runId: 'run-1',
        ownerGate: `awaiting-owner:${gate}`,
        events: [event],
        nextAction: '',
        now
      })
      expect(report?.waitingDays, event.type).toBe(3)
    }
  })

  it('stops counting once an event moves the Run off the gate', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:dispatch',
      events: [
        typed('frontdoor.node-review-continued', '2026-08-01T00:00:00.000Z', 0),
        typed('frontdoor.approval-bound', '2026-08-02T00:00:00.000Z', 1)
      ],
      nextAction: '',
      now
    })
    expect(report).toBeUndefined()
  })

  it('treats a non-accept result review as not opening the completion gate', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:completion',
      events: [resultReviewed('follow-up', '2026-09-06T00:00:00.000Z')],
      nextAction: '',
      now
    })
    expect(report).toBeUndefined()
  })

  it('grades the wait at the documented boundaries', () => {
    const at = (days: number) =>
      assessOwnerGateWait({
        runId: 'run-1',
        ownerGate: 'awaiting-owner:intake',
        events: [gateOpened('intake', new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString())],
        nextAction: '',
        now
      })?.severity
    expect(at(0)).toBe('fresh')
    expect(at(AGING_AFTER_DAYS - 1)).toBe('fresh')
    expect(at(AGING_AFTER_DAYS)).toBe('aging')
    expect(at(STALE_AFTER_DAYS - 1)).toBe('aging')
    expect(at(STALE_AFTER_DAYS)).toBe('stale')
  })

  it('returns nothing when the Ledger has no opening for the gate', () => {
    expect(assessOwnerGateWait({ runId: 'run-1', ownerGate: 'awaiting-owner:completion', events: [], nextAction: '', now })).toBeUndefined()
  })

  it('never reports a negative wait when the clock moves backwards', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:intake',
      events: [gateOpened('intake', '2026-09-10T00:00:00.000Z')],
      nextAction: '',
      now
    })
    expect(report?.waitingMs).toBe(0)
    expect(report?.severity).toBe('fresh')
  })

  it('carries the same next action the Owner is shown', () => {
    const report = assessOwnerGateWait({
      runId: 'run-1',
      ownerGate: 'awaiting-owner:completion',
      events: [gateOpened('completion', '2026-09-08T00:00:00.000Z')],
      nextAction: 'OwnerがこのRunのCompletionを確認します。',
      now
    })
    expect(report?.nextAction).toBe('OwnerがこのRunのCompletionを確認します。')
  })
})

describe('gateOf', () => {
  it('reads the gate out of the waiting state only', () => {
    expect(gateOf('awaiting-owner:node-review')).toBe('node-review')
    expect(gateOf('completed')).toBeUndefined()
    expect(gateOf(undefined)).toBeUndefined()
  })
})

describe('ordering', () => {
  const report = (runId: string, waitingMs: number) => ({
    runId,
    gate: 'intake' as const,
    openedAt: '2026-09-01T00:00:00.000Z',
    waitingMs,
    waitingDays: Math.floor(waitingMs / 86_400_000),
    nextAction: '',
    severity: 'fresh' as const
  })

  it('puts the longest-ignored Run first', () => {
    const sorted = sortByLongestWait([report('a', 10), report('b', 900), report('c', 100)])
    expect(sorted.map((entry) => entry.runId)).toEqual(['b', 'c', 'a'])
    expect(longestWait([report('a', 10), report('b', 900)])?.runId).toBe('b')
  })

  it('has no longest wait when nothing is waiting', () => {
    expect(longestWait([])).toBeUndefined()
  })
})
