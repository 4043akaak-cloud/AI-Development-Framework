import { describe, expect, it } from 'vitest'
import type { ThreadSummary } from '../src/shared/threadTypes'
import { laneForThread, liveLaneCounts, projectLiveBoard, statusLabelForThread } from '../src/renderer/src/boardProjection'

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    threadId: 'thread-1',
    taskId: 'ADF-EXAMPLE-001',
    title: 'Example thread',
    state: 'open',
    turnCount: 0,
    maxTurns: 6,
    lastAdapterId: null,
    lastTurnStatus: null,
    ownerActionRequired: false,
    recoveryRequired: false,
    updatedAt: '2026-08-11T00:00:00.000Z',
    ...overrides
  }
}

describe('laneForThread', () => {
  it('places an open thread with no turns yet in context-plan, not implementing', () => {
    expect(laneForThread(thread({ state: 'open', turnCount: 0 }))).toBe('context-plan')
  })

  it('places an open thread with turns already sent in implementing', () => {
    expect(laneForThread(thread({ state: 'open', turnCount: 1 }))).toBe('implementing')
  })

  it('maps awaiting-owner to verifying-review', () => {
    expect(laneForThread(thread({ state: 'awaiting-owner', turnCount: 1 }))).toBe('verifying-review')
  })

  it('maps recovery-needed to blocked', () => {
    expect(laneForThread(thread({ state: 'recovery-needed', turnCount: 1 }))).toBe('blocked')
  })

  it('maps failed to blocked', () => {
    expect(laneForThread(thread({ state: 'failed', turnCount: 1 }))).toBe('blocked')
  })

  it('maps stopped to blocked', () => {
    expect(laneForThread(thread({ state: 'stopped', turnCount: 1 }))).toBe('blocked')
  })

  it('maps approved to done', () => {
    expect(laneForThread(thread({ state: 'approved', turnCount: 2 }))).toBe('done')
  })

  it('maps completed to done', () => {
    expect(laneForThread(thread({ state: 'completed', turnCount: 3 }))).toBe('done')
  })
})

describe('statusLabelForThread — failed and stopped stay distinguishable inside the shared blocked lane', () => {
  it('labels a failed thread as failed', () => {
    expect(statusLabelForThread(thread({ state: 'failed' }))).toBe('failed')
  })

  it('labels a stopped thread as stopped', () => {
    expect(statusLabelForThread(thread({ state: 'stopped' }))).toBe('stopped')
  })

  it('includes the recovery reason when present', () => {
    expect(statusLabelForThread(thread({ state: 'recovery-needed', recoveryReason: 'answer-unavailable' }))).toBe('recovery-needed (answer-unavailable)')
  })
})

describe('projectLiveBoard', () => {
  it('produces one entry per thread', () => {
    const entries = projectLiveBoard([thread({ threadId: 't1', taskId: 'ADF-A' }), thread({ threadId: 't2', taskId: 'ADF-B', state: 'failed' })], [])
    expect(entries).toHaveLength(2)
    expect(entries.every((entry) => entry.kind === 'thread')).toBe(true)
  })

  it('adds a context-plan entry for an approved task that has no thread yet', () => {
    const entries = projectLiveBoard([], ['ADF-NOT-STARTED-001'])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'approved-task-without-thread', taskId: 'ADF-NOT-STARTED-001', lane: 'context-plan' })
  })

  it('does not duplicate an approved task that already has a thread', () => {
    const entries = projectLiveBoard([thread({ taskId: 'ADF-EXAMPLE-001' })], ['ADF-EXAMPLE-001'])
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('thread')
  })

  it('returns an empty list for an empty runtime', () => {
    expect(projectLiveBoard([], [])).toEqual([])
  })
})

describe('liveLaneCounts', () => {
  it('counts every lane, including zero for lanes with no entries', () => {
    const entries = projectLiveBoard(
      [thread({ threadId: 't1', taskId: 'ADF-A', state: 'awaiting-owner', turnCount: 1 }), thread({ threadId: 't2', taskId: 'ADF-B', state: 'failed', turnCount: 1 })],
      []
    )
    expect(liveLaneCounts(entries)).toEqual({ 'context-plan': 0, 'waiting-approval': 0, implementing: 0, 'verifying-review': 1, done: 0, blocked: 1 })
  })

  it('counts an empty board as all zeros, not an absent lane', () => {
    expect(liveLaneCounts([])).toEqual({ 'context-plan': 0, 'waiting-approval': 0, implementing: 0, 'verifying-review': 0, done: 0, blocked: 0 })
  })
})
