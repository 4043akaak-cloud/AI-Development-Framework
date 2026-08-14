import { describe, expect, it } from 'vitest'
import type { FrontdoorLedgerEvent, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { buildActivityTrace } from '../src/main/frontdoor/activityTrace'

const run = {
  runId: 'run-activity-001',
  requestId: 'activity-001',
  requestHash: 'request-hash',
  planHash: 'plan-hash',
  state: 'awaiting-owner',
  ownerGate: 'awaiting-owner:node-review',
  nodes: [{
    node: { nodeId: 'proposal', objective: '提案', role: 'proposal', adapterId: 'fake-ai-a', skillId: 'adf-proposal-skill', scope: { inScope: ['test'], outOfScope: [] }, contextReferences: [], acceptance: [], stopConditions: [], capabilities: ['read'], dependsOn: [], depth: 1 },
    state: 'completed', childTaskId: 'activity-001::proposal', questionIds: [], attempt: 1
  }],
  approvalIds: [],
  openQuestionIds: [],
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:01.000Z'
} as unknown as OrchestrationRun

function event(sequence: number, type: FrontdoorLedgerEvent['type'], payload: Record<string, unknown>): FrontdoorLedgerEvent {
  return { schemaVersion: 1, sequence, eventId: `event-${sequence}`, runId: run.runId, occurredAt: `2026-08-15T00:00:0${sequence}.000Z`, previousEventHash: 'previous', eventHash: 'hash', type, payload }
}

describe('ADF Activity Trace projection', () => {
  it('projects observable Node, Skill, Owner Gate, and Verification states without inventing hidden work', () => {
    const activities = buildActivityTrace([
      event(0, 'frontdoor.run-created', {}),
      event(1, 'frontdoor.owner-gate-opened', { gate: 'intake' }),
      event(2, 'frontdoor.node-started', { nodeId: 'proposal' }),
      event(3, 'frontdoor.node-completed', { nodeId: 'proposal' }),
      event(4, 'frontdoor.node-review-opened', { nodeId: 'proposal' })
    ], run)

    expect(activities.map((activity) => activity.kind)).toEqual(['system', 'owner', 'agent', 'agent', 'verification'])
    expect(activities[1]).toMatchObject({ status: 'waiting', label: 'Owner Gate待ち: intake' })
    expect(activities[2]).toMatchObject({ adapterId: 'fake-ai-a', role: 'proposal', skillId: 'adf-proposal-skill', status: 'running' })
    expect(activities[4]).toMatchObject({ kind: 'verification', status: 'waiting' })
  })

  it('marks Skill as unrecorded by omission rather than guessing a Codex internal Skill', () => {
    const activities = buildActivityTrace([event(0, 'frontdoor.node-started', { nodeId: 'proposal' })], { ...run, nodes: [{ ...run.nodes[0], node: { ...run.nodes[0].node, skillId: undefined } }] })
    expect(activities[0]?.skillId).toBeUndefined()
  })

  it('bounds the derived timeline to the newest events', () => {
    const events = Array.from({ length: 5 }, (_, index) => event(index, 'frontdoor.run-created', {}))
    expect(buildActivityTrace(events, run, 2).map((activity) => activity.activityId)).toEqual(['event-3', 'event-4'])
  })
})
