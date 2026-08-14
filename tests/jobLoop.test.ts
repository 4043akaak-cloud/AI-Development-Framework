import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, DispatchAck, FixtureMode } from '../src/shared/jobLoopTypes'
import { assertTransition, createDispatchKey, validateApprovedTask } from '../src/main/jobLoop/contracts'
import { buildExplicitAdapterPlan, routeAdapters } from '../src/main/jobLoop/adapterRegistry'
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

describe('ADF-OLLAMA-LIVE-CONNECTION-001 Job identity binds to the approved adapterPlan/approval (2nd Blocking finding fix)', () => {
  /** Same Scope/Context/Target/adapter-mode as approvedTask(), but a different explicit adapterPlan/approval — the exact shape of the real fake-ai-a-vs-ollama-local collision the Owner found. */
  function explicitlyApprovedPacket(approvalId: string): ApprovedTaskPacket {
    const base = approvedTask()
    const explicitPlan = buildExplicitAdapterPlan(base.taskId, 'ollama-local', 'proposal', ['read', 'propose'])
    return { ...base, approval: { ...base.approval, approvalId, routingPlanHash: hashJson(explicitPlan) }, adapterPlan: explicitPlan }
  }

  it('createDispatchKey changes when adapterPlan (routingPlanHash) differs, even with identical Scope/Context/Target/adapter mode', () => {
    const fakePacket = approvedTask()
    const ollamaPacket = explicitlyApprovedPacket('approval-adf-job-loop-001-explicit')
    expect(createDispatchKey(fakePacket)).not.toBe(createDispatchKey(ollamaPacket))
  })

  it('createDispatchKey stays identical for a byte-for-byte re-run of the same Packet (idempotency is unaffected)', () => {
    const packet = approvedTask()
    expect(createDispatchKey(packet)).toBe(createDispatchKey({ ...packet }))
  })

  it('a Packet with a different adapterPlan never reuses the prior Job: it gets its own Job with its own fresh Ledger', async () => {
    const current = await runtime()
    const fakePacket = approvedTask()
    const first = await current.registerApprovedJob(fakePacket)
    expect(first.alreadyRegistered).toBe(false)

    const ollamaPacket = explicitlyApprovedPacket('approval-adf-job-loop-001-explicit')
    const second = await current.registerApprovedJob(ollamaPacket)

    expect(second.alreadyRegistered).toBe(false)
    expect(second.jobId).not.toBe(first.jobId)
  })

  it('re-running the identical Packet (same approvalId, same routingPlanHash) still reuses the existing Job — the one legitimate reuse case', async () => {
    const current = await runtime()
    const packet = approvedTask()
    const first = await current.registerApprovedJob(packet)
    const second = await current.registerApprovedJob(packet)
    expect(second.jobId).toBe(first.jobId)
    expect(second.alreadyRegistered).toBe(true)
  })

  it("a new Job's full Ledger — request/adapter-plan/approval/dispatch-packet/dispatch-ack — all agree with the newly approved ollama-local Plan", async () => {
    const current = await runtime()
    const packet = explicitlyApprovedPacket('approval-adf-job-loop-001-explicit-v2')
    const registration = await current.registerApprovedJob(packet)
    const directory = current.jobDirectory(registration.jobId)

    const request = JSON.parse(await readFile(path.join(directory, 'request.json'), 'utf8')) as { task: { adapterPlan: { selections: Array<{ adapterId: string }> } } }
    expect(request.task.adapterPlan.selections).toEqual([expect.objectContaining({ adapterId: 'ollama-local', role: 'proposal' })])

    const adapterPlan = JSON.parse(await readFile(path.join(directory, 'adapter-plan.json'), 'utf8')) as { selections: Array<{ adapterId: string }> }
    expect(adapterPlan.selections).toEqual([expect.objectContaining({ adapterId: 'ollama-local', role: 'proposal' })])

    const approval = JSON.parse(await readFile(path.join(directory, 'approval.json'), 'utf8')) as { approvalId: string; routingPlanHash: string }
    expect(approval).toMatchObject({ approvalId: 'approval-adf-job-loop-001-explicit-v2', routingPlanHash: packet.approval.routingPlanHash })

    const dispatchPacket = JSON.parse(await readFile(path.join(directory, 'dispatch-packet.json'), 'utf8')) as { adapterPlan: { selections: Array<{ adapterId: string }> } }
    expect(dispatchPacket.adapterPlan.selections).toEqual([expect.objectContaining({ adapterId: 'ollama-local', role: 'proposal' })])

    const dispatchAck = JSON.parse(await readFile(path.join(directory, 'dispatch-ack.json'), 'utf8')) as { status: string }
    expect(dispatchAck.status).toBe('acknowledged')
  })

  it("the prior fake-ai-a Job's own Ledger is left untouched when a later, differently-approved Packet registers its own Job", async () => {
    const current = await runtime()
    const fakePacket = approvedTask()
    const first = await current.registerApprovedJob(fakePacket)
    const beforeRequest = await readFile(path.join(current.jobDirectory(first.jobId), 'request.json'), 'utf8')
    const beforeApproval = await readFile(path.join(current.jobDirectory(first.jobId), 'approval.json'), 'utf8')

    await current.registerApprovedJob(explicitlyApprovedPacket('approval-adf-job-loop-001-explicit-v3'))

    expect(await readFile(path.join(current.jobDirectory(first.jobId), 'request.json'), 'utf8')).toBe(beforeRequest)
    expect(await readFile(path.join(current.jobDirectory(first.jobId), 'approval.json'), 'utf8')).toBe(beforeApproval)
    const oldAdapterPlan = JSON.parse(await readFile(path.join(current.jobDirectory(first.jobId), 'adapter-plan.json'), 'utf8')) as { selections: Array<{ adapterId: string }> }
    expect(oldAdapterPlan.selections.map((selection) => selection.adapterId)).toEqual(['fake-ai-a', 'fake-ai-b'])
  })
})
