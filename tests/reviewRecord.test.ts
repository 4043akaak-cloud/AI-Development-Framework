import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import type { ReviewRun } from '../src/shared/reviewTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { FrontdoorOrchestrator } from '../src/main/frontdoor/orchestrator'
import { readFrontdoorEvents } from '../src/main/frontdoor/eventLedger'
import { deriveChildPackets } from '../src/main/frontdoor/childPacket'
import { readPlan, readRequest } from '../src/main/frontdoor/ledger'
import { ReviewRecordRejectedError, listReviewRuns, recordReviewRun, reviewClearance, reviewRecordRef, reviewTargetHash } from '../src/main/frontdoor/reviewRecord'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const requestInput: FrontdoorRequestInput = {
  requestId: 'review-record-request-001',
  source: 'test',
  objective: 'レビューをRunへ束縛する',
  userInput: 'レビュー結果をLedgerへ記録する',
  projectRef: 'fixture://adf',
  constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 1, maxDepth: 1, externalSend: false },
  requestedOutput: 'レビュー記録',
  contextReferences: ['fixture://goal.md'],
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
}

const proposal: DecompositionNode = {
  nodeId: 'proposal',
  objective: '案を出す',
  role: 'proposal',
  adapterId: 'fake-ai-a',
  scope: { inScope: ['proposal'], outOfScope: ['external-send', 'write-canonical', 'commit'] },
  contextReferences: ['fixture://goal.md'],
  acceptance: ['Resultを返す'],
  stopConditions: ['Scope外要求'],
  capabilities: ['read', 'propose'],
  dependsOn: [],
  depth: 1
}

function review(overrides: Partial<ReviewRun> = {}): ReviewRun {
  return {
    reviewId: 'review-001',
    packet: { packetId: 'review-packet-001', targetTaskId: 'ADF-EXAMPLE-001', revisionRange: 'abc123..def456', files: ['src/example.ts'], claims: ['the guard is wired'], questions: [], createdAt: '2026-09-09T00:00:00.000Z' },
    reviewer: 'Codex',
    implementer: 'Claude Code',
    completion: 'complete',
    findings: [{ findingId: 'F1', severity: 'P2', summary: 'naming', evidence: 'src/example.ts:10', reproduction: 'reproduced', disposition: 'accepted' }],
    reviewedAt: '2026-09-09T01:00:00.000Z',
    ...overrides
  }
}

async function executedRun() {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-review-record-'))
  roots.push(runtimeRoot)
  const orchestrator = new FrontdoorOrchestrator({ relay: new ConversationRelay({ runtimeRoot }) })
  const created = await orchestrator.createRun(requestInput, { planId: 'review-record-plan-001', requestId: requestInput.requestId, version: 1, nodes: [proposal], aggregationPolicy: 'collect-all' })
  await orchestrator.approveIntake(created.runId)
  await orchestrator.approveCompletionShape(created.runId)
  await orchestrator.approveDecomposition(created.runId)
  const packets = deriveChildPackets(await readRequest(runtimeRoot, created.runId), created, await readPlan(runtimeRoot, created.runId), {
    approvalId: 'approval-review-record-001',
    approvedBy: 'Project Owner',
    approvedAt: '2026-09-09T00:00:00.000Z',
    expiresAt: '2099-12-31T00:00:00.000Z'
  })
  const { mkdir } = await import('node:fs/promises')
  await mkdir(path.join(runtimeRoot, 'approved-tasks'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'approved-tasks', `${packets.proposal.taskId}.json`), `${JSON.stringify(packets.proposal, null, 2)}\n`, 'utf8')
  await orchestrator.approveDispatch(created.runId, ['proposal'])
  await orchestrator.executeApprovedRun(created.runId, packets, { requirePacketBinding: true })
  return { runtimeRoot, orchestrator, run: await orchestrator.getRun(created.runId) }
}

describe('recordReviewRun', () => {
  it('binds the review to the Run and stores ADF’s own verdict beside it', async () => {
    const { runtimeRoot, run } = await executedRun()
    const record = await recordReviewRun(runtimeRoot, run, review(), 'Project Owner', '2026-09-09T02:00:00.000Z')

    expect(record.runId).toBe(run.runId)
    expect(record.targetHash).toBe(reviewTargetHash(run))
    expect(record.outcome.doneEligible).toBe(true)

    // Both halves must exist: the file the Owner can read, and the Ledger entry that proves when it
    // was written. A review that lives only in a file has no place in the Run's history.
    const stored = JSON.parse(await readFile(path.join(runtimeRoot, reviewRecordRef(run.runId, 'review-001')), 'utf8'))
    expect(stored).toEqual(record)
    const events = await readFrontdoorEvents(runtimeRoot, run.runId)
    expect(events.filter((event) => event.type === 'frontdoor.review-run-recorded')).toHaveLength(1)
  })

  it('records a failing review rather than refusing it', async () => {
    const { runtimeRoot, run } = await executedRun()
    // Refusing to record this would lose the only evidence that a review happened and fell short —
    // which is exactly the failure mode of keeping reviews in Task-header prose.
    const record = await recordReviewRun(runtimeRoot, run, review({ reviewer: 'Claude Code' }), 'Project Owner', '2026-09-09T02:00:00.000Z')
    expect(record.outcome.doneEligible).toBe(false)
    expect(record.outcome.blockers.join()).toContain('Claude Code')
  })

  it('refuses to overwrite a review that is already recorded', async () => {
    const { runtimeRoot, run } = await executedRun()
    await recordReviewRun(runtimeRoot, run, review(), 'Project Owner', '2026-09-09T02:00:00.000Z')
    await expect(recordReviewRun(runtimeRoot, run, review({ findings: [] }), 'Project Owner', '2026-09-09T03:00:00.000Z')).rejects.toBeInstanceOf(ReviewRecordRejectedError)
  })

  it('rejects a review whose findings are not shaped like findings', async () => {
    const { runtimeRoot, run } = await executedRun()
    const malformed = review({ findings: [{ findingId: 'F1', severity: 'CRITICAL', summary: 'x', evidence: '', reproduction: 'reproduced' } as never] })
    await expect(recordReviewRun(runtimeRoot, run, malformed, 'Project Owner', '2026-09-09T02:00:00.000Z')).rejects.toThrow(/severity is invalid/)
  })

  it('rejects a review with no reviewer identity', async () => {
    const { runtimeRoot, run } = await executedRun()
    await expect(recordReviewRun(runtimeRoot, run, review({ reviewer: '   ' }), 'Project Owner', '2026-09-09T02:00:00.000Z')).rejects.toThrow(/reviewer is required/)
  })
})

describe('listReviewRuns and reviewClearance', () => {
  it('clears a Run only when a recorded review covers its current state', async () => {
    const { runtimeRoot, run } = await executedRun()
    expect(reviewClearance(await listReviewRuns(runtimeRoot, run.runId), reviewTargetHash(run)).cleared).toBe(false)

    await recordReviewRun(runtimeRoot, run, review(), 'Project Owner', '2026-09-09T02:00:00.000Z')
    const reviews = await listReviewRuns(runtimeRoot, run.runId)
    expect(reviewClearance(reviews, reviewTargetHash(run))).toEqual({ cleared: true, blockers: [] })

    // The same review against a Run that has since moved on is stale, not clearing. A verdict about
    // a state that no longer exists must not carry forward silently.
    const moved = { ...run, nodes: run.nodes.map((record) => ({ ...record, resultHash: 'a'.repeat(64) })) }
    const clearance = reviewClearance(reviews, reviewTargetHash(moved))
    expect(clearance.cleared).toBe(false)
    expect(clearance.blockers).toEqual(['no independent review has been recorded against the current state of this Run'])
  })

  it('surfaces a tampered review instead of dropping it', async () => {
    const { runtimeRoot, run } = await executedRun()
    // A review that genuinely did not clear, then rewritten on disk to say it did. Starting from an
    // already-clearing review would make the tamper a no-op and the test vacuous.
    await recordReviewRun(runtimeRoot, run, review({ completion: 'incomplete', incompleteReason: 'usage limit' }), 'Project Owner', '2026-09-09T02:00:00.000Z')
    const file = path.join(runtimeRoot, reviewRecordRef(run.runId, 'review-001'))
    const stored = JSON.parse(await readFile(file, 'utf8'))
    await writeFile(file, `${JSON.stringify({ ...stored, outcome: { ...stored.outcome, doneEligible: true, blockers: [] } }, null, 2)}\n`, 'utf8')

    const reviews = await listReviewRuns(runtimeRoot, run.runId)
    expect(reviews[0].tampered).toBe(true)
    // A rewritten verdict must not clear the Run just because it now says it does.
    expect(reviewClearance(reviews, reviewTargetHash(run)).cleared).toBe(false)
  })

  it('reports blockers per review when none of them clear', async () => {
    const { runtimeRoot, run } = await executedRun()
    await recordReviewRun(runtimeRoot, run, review({ completion: 'incomplete', incompleteReason: 'usage limit' }), 'Project Owner', '2026-09-09T02:00:00.000Z')
    const clearance = reviewClearance(await listReviewRuns(runtimeRoot, run.runId), reviewTargetHash(run))
    expect(clearance.cleared).toBe(false)
    expect(clearance.blockers.join()).toContain('review-001: the reviewer stopped before finishing: usage limit')
  })
})
