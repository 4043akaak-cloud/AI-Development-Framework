import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConversationThread } from '../src/shared/threadTypes'
import { hashJson } from '../src/main/jobLoop/hash'
import { inspectThreadArtifacts } from '../src/main/jobLoop/liveArtifacts'

function thread(overrides: Partial<ConversationThread> = {}): ConversationThread {
  return {
    threadId: 'thread-1',
    taskId: 'ADF-LIVE-001',
    jobId: 'job-1',
    title: 'Live artifact test',
    approvalId: 'approval-1',
    scopeHash: 'scope-hash',
    contextHash: 'context-hash',
    routingPlanHash: 'routing-hash',
    adapterPlan: {} as ConversationThread['adapterPlan'],
    inputHash: 'input-hash',
    state: 'completed',
    maxTurns: 2,
    turns: [],
    ownerDecisions: [],
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:01:00.000Z',
    ...overrides
  }
}

function envelope() {
  return {
    resultId: 'result-1',
    jobId: 'job-1',
    taskId: 'ADF-LIVE-001',
    adapterId: 'fake-ai-a',
    role: 'proposal' as const,
    inputHash: 'input-hash',
    scopeHash: 'scope-hash',
    contextHash: 'context-hash',
    status: 'success' as const,
    content: 'A'.repeat(13_000),
    summary: '検証済みの要約',
    artifact: { kind: 'proposal' },
    verification: [{ name: 'unit', status: 'pass' as const }],
    risks: [],
    ownerDecisionRequired: true,
    nextOwnerDecision: 'review',
    createdAt: '2026-08-19T00:01:00.000Z',
    durationMs: 10,
    terminationReason: 'completed'
  }
}

async function writeFixture(runtimeRoot: string, result: ReturnType<typeof envelope>): Promise<void> {
  await mkdir(path.join(runtimeRoot, 'threads/thread-1/results'), { recursive: true })
  await writeFile(path.join(runtimeRoot, 'threads/thread-1/results/turn-1.json'), `${JSON.stringify(result)}\n`, 'utf8')
  await writeFile(path.join(runtimeRoot, 'threads/thread-1/evidence-links.json'), `${JSON.stringify({ threadId: 'thread-1', taskId: 'ADF-LIVE-001', jobId: 'job-1', turns: [{ turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result) }] })}\n`, 'utf8')
}

describe('inspectThreadArtifacts', () => {
  it('returns verified Result and Evidence without exposing unbounded content', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const result = envelope()
    await writeFixture(runtimeRoot, result)
    const inspectedThread = thread({ turns: [{ turnId: 'turn-1', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result), createdAt: result.createdAt }] })

    const inspected = await inspectThreadArtifacts(runtimeRoot, inspectedThread)

    expect(inspected.results[0]).toMatchObject({ artifactStatus: 'available', summary: '検証済みの要約', hash: hashJson(result) })
    expect(inspected.results[0].content).toContain('表示上限により省略')
    expect(inspected.evidence).toMatchObject({ artifactStatus: 'available', turnCount: 1 })
    expect(inspected.workPlane.artifactStatus).toBe('not-applicable')
  })

  it('marks tampered Result and mismatched Evidence as Broken instead of opening them', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const result = envelope()
    await writeFixture(runtimeRoot, result)
    const before = await readFile(path.join(runtimeRoot, 'threads/thread-1/results/turn-1.json'), 'utf8')
    const inspectedThread = thread({ turns: [{ turnId: 'turn-1', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: '0'.repeat(64), createdAt: result.createdAt }] })

    const inspected = await inspectThreadArtifacts(runtimeRoot, inspectedThread)

    expect(inspected.results[0].artifactStatus).toBe('broken')
    expect(inspected.results[0].issue).toMatch(/hash mismatch/i)
    expect(inspected.evidence).toMatchObject({ artifactStatus: 'broken', issue: expect.stringMatching(/hash mismatch/i) })
    expect(await readFile(path.join(runtimeRoot, 'threads/thread-1/results/turn-1.json'), 'utf8')).toBe(before)
  })

  it('marks a missing Result hash as Broken and rejects non-completed Threads at the Main-side helper boundary', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const result = envelope()
    await writeFixture(runtimeRoot, result)
    const missingHash = thread({ turns: [{ turnId: 'turn-1', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', createdAt: result.createdAt }] })
    const inspected = await inspectThreadArtifacts(runtimeRoot, missingHash)
    expect(inspected.results[0]).toMatchObject({ artifactStatus: 'broken', issue: expect.stringMatching(/hash is missing/i) })
    await expect(inspectThreadArtifacts(runtimeRoot, thread({ state: 'approved' }))).rejects.toThrow(/completed Threads/i)
  })

  it('marks Evidence as Broken when a turn reference or hash is tampered', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const result = envelope()
    await writeFixture(runtimeRoot, result)
    await writeFile(path.join(runtimeRoot, 'threads/thread-1/evidence-links.json'), `${JSON.stringify({ threadId: 'thread-1', taskId: 'ADF-LIVE-001', jobId: 'job-1', turns: [{ turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/other.json', resultEnvelopeHash: hashJson(result) }] })}\n`, 'utf8')
    const inspectedThread = thread({ turns: [{ turnId: 'turn-1', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result), createdAt: result.createdAt }] })

    const inspected = await inspectThreadArtifacts(runtimeRoot, inspectedThread)

    expect(inspected.evidence).toMatchObject({ artifactStatus: 'broken', issue: expect.stringMatching(/reference mismatch/i) })
  })

  it('rejects missing or duplicate Evidence turn hashes', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const result = envelope()
    await writeFixture(runtimeRoot, result)
    await writeFile(path.join(runtimeRoot, 'threads/thread-1/evidence-links.json'), `${JSON.stringify({ threadId: 'thread-1', taskId: 'ADF-LIVE-001', jobId: 'job-1', turns: [{ turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json' }] })}\n`, 'utf8')
    const inspectedThread = thread({ turns: [{ turnId: 'turn-1', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result), createdAt: result.createdAt }] })
    expect((await inspectThreadArtifacts(runtimeRoot, inspectedThread)).evidence.issue).toMatch(/hash is missing/i)

    await writeFile(path.join(runtimeRoot, 'threads/thread-1/evidence-links.json'), `${JSON.stringify({ threadId: 'thread-1', taskId: 'ADF-LIVE-001', jobId: 'job-1', turns: [{ turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result) }, { turnId: 'turn-1', resultEnvelopeRef: 'threads/thread-1/results/turn-1.json', resultEnvelopeHash: hashJson(result) }] })}\n`, 'utf8')
    expect((await inspectThreadArtifacts(runtimeRoot, inspectedThread)).evidence.issue).toMatch(/duplicate/i)
  })

  it('fails closed on a traversal reference', async () => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'adf-live-artifacts-'))
    const inspected = await inspectThreadArtifacts(runtimeRoot, thread({ turns: [{ turnId: 'turn-escape', threadId: 'thread-1', jobId: 'job-1', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', content: 'answer', status: 'success', resultEnvelopeRef: '../outside.json', createdAt: '2026-08-19T00:01:00.000Z' }] }))

    expect(inspected.results[0]).toMatchObject({ artifactStatus: 'broken', issue: expect.stringMatching(/parent traversal|outside/i) })
  })
})
