import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DecompositionNode, OrchestrationNodeRecord, OrchestrationRun } from '../src/shared/frontdoorTypes'
import { appendFrontdoorEvent, readFrontdoorEvents, replayFrontdoorRun } from '../src/main/frontdoor/eventLedger'
import { claimRun, readRunClaim, releaseRun } from '../src/main/frontdoor/ledger'

const node: DecompositionNode = {
  nodeId: 'proposal',
  objective: 'proposalを実行する',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: { inScope: ['proposal'], outOfScope: ['external-send'] },
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Resultを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function initialRun(): OrchestrationRun {
  const record: OrchestrationNodeRecord = { node, state: 'queued', childTaskId: 'request-001::proposal', questionIds: [], attempt: 0 }
  return {
    runId: 'run-ledger-001',
    requestId: 'request-001',
    requestHash: 'request-hash',
    planHash: 'plan-hash',
    state: 'ready-for-approval',
    nodes: [record],
    approvalIds: [],
    openQuestionIds: [],
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z'
  }
}

describe('Frontdoor event-sourcing ledger', () => {
  it('replays a deterministic run from the chained event stream', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-events-'))
    const run = initialRun()
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.run-created', { snapshot: run })
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.approval-bound', { approvalIds: ['approval-001'] })
    const started: OrchestrationNodeRecord = { ...run.nodes[0], state: 'running', attempt: 1 }
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.node-started', { nodeId: node.nodeId, attempt: 1 })
    const completed: OrchestrationNodeRecord = { ...started, state: 'completed', childJobId: 'job-001', threadId: 'thread-001', resultRef: 'threads/thread-001/results/turn-0.json', resultHash: 'result-hash', resultStatus: 'success' }
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.node-completed', { nodeId: node.nodeId, nodeRecord: completed, runState: 'running' })
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.run-completed', { status: 'complete', aggregateRef: 'frontdoor-runs/run-ledger-001/aggregate.json', openQuestionIds: [] })

    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    const first = replayFrontdoorRun(events)
    const second = replayFrontdoorRun(events)
    expect(first).toEqual(second)
    expect(first.state).toBe('complete')
    expect(first.approvalIds).toEqual(['approval-001'])
    expect(first.nodes[0]).toEqual(completed)
  })

  it('rejects tampering and sequence corruption before replay', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-event-tamper-'))
    const run = initialRun()
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.run-created', { snapshot: run })
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.approval-bound', { approvalIds: ['approval-001'] })
    const eventsPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'events.jsonl')
    const tampered = (await readFile(eventsPath, 'utf8')).replace('approval-001', 'approval-tampered')
    await writeFile(eventsPath, tampered, 'utf8')
    await expect(readFrontdoorEvents(runtimeRoot, run.runId).then((events) => replayFrontdoorRun(events))).rejects.toThrow(/hash mismatch/)
  })

  it('rejects reordered events and invalid state transitions', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-event-order-'))
    const run = initialRun()
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.run-created', { snapshot: run })
    await appendFrontdoorEvent(runtimeRoot, run.runId, 'frontdoor.approval-bound', { approvalIds: ['approval-001'] })
    const eventsPath = path.join(runtimeRoot, 'frontdoor-runs', run.runId, 'events.jsonl')
    const lines = (await readFile(eventsPath, 'utf8')).trim().split('\n')
    await writeFile(eventsPath, `${lines.reverse().join('\n')}\n`, 'utf8')
    await expect(readFrontdoorEvents(runtimeRoot, run.runId).then((events) => replayFrontdoorRun(events))).rejects.toThrow(/run-created|sequence/)

    const transitionRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-event-transition-'))
    await appendFrontdoorEvent(transitionRoot, run.runId, 'frontdoor.run-created', { snapshot: run })
    const completed = { ...run.nodes[0], state: 'completed' as const }
    await appendFrontdoorEvent(transitionRoot, run.runId, 'frontdoor.node-completed', { nodeId: node.nodeId, nodeRecord: completed })
    await expect(readFrontdoorEvents(transitionRoot, run.runId).then((events) => replayFrontdoorRun(events))).rejects.toThrow(/invalid prior state/)
  })

  it('does not release a claim when the token does not match', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-frontdoor-claims-'))
    const runId = 'run-claim-001'
    await mkdir(path.join(runtimeRoot, 'frontdoor-runs', runId), { recursive: true })
    const claim = await claimRun(runtimeRoot, runId, 'test-owner')
    await releaseRun(runtimeRoot, runId, 'wrong-token')
    expect((await readRunClaim(runtimeRoot, runId))?.token).toBe(claim.token)
    await releaseRun(runtimeRoot, runId, claim.token)
    expect(await readRunClaim(runtimeRoot, runId)).toBeNull()
  })
})
