import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, DispatchAck, FixtureMode } from '../src/shared/jobLoopTypes'
import { assertTransition, validateApprovedTask } from '../src/main/jobLoop/contracts'
import { routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { DispatchBlockedError, FakeDispatchReceiver } from '../src/main/jobLoop/dispatchAck'
import { JobRuntime } from '../src/main/jobLoop/runtime'

function approvedTask(fixtureMode: FixtureMode = 'success'): ApprovedTaskPacket {
  const scope = {
    inScope: ['Task受付', 'Job登録', 'Fake Adapter A/Bの1ラウンド', 'Result取込', 'Board Projection'],
    outOfScope: ['外部AI', 'MCP', 'API', 'DB', 'worktree', '正本自動書込み', '自動統合']
  }
  const context = {
    githubTask: 'manual-fixture://ADF-JOB-LOOP-001',
    obsidianContext: ['manual-fixture://16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md'],
    adoptedPrinciples: ['owner-approval', 'source-boundary', 'result-before-integration']
  }
  const taskId = 'ADF-JOB-LOOP-001'
  const scopeHash = hashJson(scope)
  const adapterPlan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
  return {
    taskId,
    objective: '承認済みTaskをFake Adapter A/Bの1ラウンド討論へ渡し、Owner Review待ちまで追跡する',
    scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: ['A/B Resultを追跡できる', 'Result取込後にawaiting-reviewで停止する', '正本への自動書込みがない'],
    stopConditions: ['Approval不在・期限切れ・hash不一致', '不正Result', 'Scope外能力の要求'],
    approval: {
      approvalId: 'approval-adf-job-loop-001-mvp',
      taskId,
      status: 'active',
      approvedBy: 'Project Owner',
      approvedAt: '2026-08-08T00:00:00.000Z',
      expiresAt: '2099-12-31T23:59:59.000Z',
      scopeHash,
      routingPlanHash: hashJson(adapterPlan),
      capabilities: ['read', 'propose']
    },
    adapter: 'multi-ai-routing-v1',
    fixtureMode,
    target: {
      repository: 'fixture://block-defense',
      branch: 'fixture/bd-003',
      worktree: 'fixture://bd-003-worktree',
      allowedFiles: ['docs/tasks/BD-003.md', 'docs/evidence/BD-003/'],
      forbiddenChanges: ['source code', 'commit', 'push', 'Obsidian canonical notes']
    },
    adapterPlan
  }
}

async function runtime(): Promise<JobRuntime> {
  return new JobRuntime({ runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-job-loop-')) })
}

describe('ADF-JOB-LOOP-001', () => {
  it('runs a one-round Fake A proposal and Fake B critique, then waits for Owner', async () => {
    const current = await runtime()
    const job = await current.runApprovedTask(approvedTask())
    const board = await current.readBoard()

    expect(job.state).toBe('awaiting-review')
    expect(job.result?.status).toBe('success')
    expect(job.result?.debate.rounds).toBe(1)
    expect(job.result?.debate.participants).toHaveLength(2)
    expect(job.result?.adapterPlan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(job.result?.adapterRuns.map((run) => run.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
    expect(job.result?.debate.participants[1].respondsToHash).toBe(job.result?.debate.participants[0].hash)
    expect(job.events.map((event) => event.type)).toEqual(expect.arrayContaining(['dispatch.sent', 'dispatch.acknowledged', 'dispatch.preflight-valid']))
    expect(job.dispatchState).toBe('preflight-valid')
    const dispatchPacket = JSON.parse(await readFile(path.join(current.jobDirectory(job.jobId), 'dispatch-packet.json'), 'utf8')) as { taskId: string; packetHash: string; target: { branch: string } }
    const dispatchAck = JSON.parse(await readFile(path.join(current.jobDirectory(job.jobId), 'dispatch-ack.json'), 'utf8')) as { taskId: string; packetHash: string; status: string }
    const adapterPlan = JSON.parse(await readFile(path.join(current.jobDirectory(job.jobId), 'adapter-plan.json'), 'utf8')) as { selections: Array<{ adapterId: string; role: string }> }
    const adapterResults = JSON.parse(await readFile(path.join(current.jobDirectory(job.jobId), 'adapter-results.json'), 'utf8')) as Array<{ adapterId: string; resultHash: string; role: string }>
    expect(dispatchPacket).toMatchObject({ taskId: 'ADF-JOB-LOOP-001', target: { branch: 'fixture/bd-003' } })
    expect(dispatchAck).toMatchObject({ taskId: dispatchPacket.taskId, packetHash: dispatchPacket.packetHash, status: 'acknowledged' })
    expect(adapterPlan.selections).toEqual([
      expect.objectContaining({ adapterId: 'fake-ai-a', role: 'proposal' }),
      expect.objectContaining({ adapterId: 'fake-ai-b', role: 'critic' })
    ])
    expect(adapterResults).toEqual([
      expect.objectContaining({ adapterId: 'fake-ai-a', role: 'proposal', resultHash: expect.any(String) }),
      expect.objectContaining({ adapterId: 'fake-ai-b', role: 'critic', resultHash: expect.any(String) })
    ])
    expect(board.cards[0].boardLane).toBe('owner-review')
    expect(board.cards[0].dispatchState).toBe('preflight-valid')
    expect(board.cards[0].formalLifecycle).toBe('Approved / implementation result not yet adopted')
  })

  it('is idempotent for duplicate dispatch', async () => {
    const current = await runtime()
    const packet = approvedTask()
    const first = await current.runApprovedTask(packet)
    const second = await current.runApprovedTask(packet)
    expect(second.jobId).toBe(first.jobId)
    expect(second.events).toHaveLength(first.events.length)
  })

  it('routes roles to different local Fake Adapters by cost and specialization', () => {
    const plan = routeAdapters('ADF-JOB-LOOP-001', ['proposal', 'critic'], ['read', 'propose'])
    expect(plan.externalSend).toBe(false)
    expect(plan.selections).toEqual([
      expect.objectContaining({ adapterId: 'fake-ai-a', role: 'proposal' }),
      expect.objectContaining({ adapterId: 'fake-ai-b', role: 'critic' })
    ])
  })

  it('blocks a packet hash mismatch before creating a Job', async () => {
    const current = new JobRuntime({
      runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-dispatch-mismatch-')),
      receiver: new FakeDispatchReceiver((ack) => ({ ...ack, packetHash: 'wrong-packet-hash' }))
    })
    await expect(current.runApprovedTask(approvedTask())).rejects.toBeInstanceOf(DispatchBlockedError)
    await expect(readdir(path.join(current.runtimeRoot, 'jobs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('blocks a missing ACK before creating a Job', async () => {
    const current = new JobRuntime({
      runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-dispatch-missing-')),
      receiver: new FakeDispatchReceiver(() => null)
    })
    await expect(current.runApprovedTask(approvedTask())).rejects.toThrow(/Delivery not confirmed/i)
    await expect(readdir(path.join(current.runtimeRoot, 'jobs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['target mismatch', (ack: DispatchAck) => ({ ...ack, target: { ...ack.target, branch: 'fixture/wrong-branch' } })],
    ['capability mismatch', (ack: DispatchAck) => ({ ...ack, acceptedCapabilities: ['read'] as DispatchAck['acceptedCapabilities'] })]
  ])('blocks an ACK with %s before creating a Job', async (_label, mutate) => {
    const current = new JobRuntime({
      runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-dispatch-field-mismatch-')),
      receiver: new FakeDispatchReceiver(mutate)
    })
    await expect(current.runApprovedTask(approvedTask())).rejects.toThrow(/Delivery not confirmed/i)
    await expect(readdir(path.join(current.runtimeRoot, 'jobs'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects missing approval, scope mismatch, expired approval, and excess capability', async () => {
    const cases = [
      (packet: ApprovedTaskPacket) => { packet.approval.status = 'revoked' },
      (packet: ApprovedTaskPacket) => { packet.scopeHash = 'wrong' },
      (packet: ApprovedTaskPacket) => { packet.approval.expiresAt = '2000-01-01T00:00:00.000Z' },
      (packet: ApprovedTaskPacket) => { packet.approval.capabilities = ['write-canonical' as never] },
      (packet: ApprovedTaskPacket) => { packet.adapterPlan.selections[0].adapterId = 'fake-ai-b' }
    ]
    for (const mutate of cases) {
      const packet = approvedTask()
      mutate(packet)
      expect(() => validateApprovedTask(packet)).toThrow(/rejected|mismatch|expired|capability/i)
    }
  })

  for (const mode of ['partial', 'failed', 'invalid'] as const) {
    it(`records ${mode} as structured result without auto-completion`, async () => {
      const current = await runtime()
      const job = await current.runApprovedTask(approvedTask(mode))
      expect(job.result?.status).toBe(mode)
      expect(job.state).toBe(mode === 'partial' ? 'awaiting-review' : 'failed')
      expect(job.result?.ownerDecisionRequired).toBe(true)
    })
  }

  it('rebuilds Board projection after a new Runtime instance starts', async () => {
    const current = await runtime()
    const job = await current.runApprovedTask(approvedTask())
    const restarted = new JobRuntime({ runtimeRoot: current.runtimeRoot })
    const board = await restarted.projectBoard()
    expect(board.cards[0].jobId).toBe(job.jobId)
    expect(board.cards[0].boardLane).toBe('owner-review')
  })

  it('rejects invalid state transitions and keeps canonical fixture content untouched', async () => {
    expect(() => assertTransition('queued', 'awaiting-review')).toThrow(/Invalid job transition/)
    expect(() => assertTransition('awaiting-review', 'running')).toThrow(/Invalid job transition/)
    const fixture = path.resolve('docs/tasks/ADF-JOB-LOOP-001.md')
    const before = await readFile(fixture, 'utf8')
    const current = await runtime()
    await current.runApprovedTask(approvedTask())
    expect(await readFile(fixture, 'utf8')).toBe(before)
    await expect(readdir(current.runtimeRoot, { withFileTypes: true })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'jobs' })]))
  })
})
