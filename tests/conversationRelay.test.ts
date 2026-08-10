import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket, FixtureMode } from '../src/shared/jobLoopTypes'
import type { ConversationThread, ConversationTurn } from '../src/shared/threadTypes'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { JobRuntime } from '../src/main/jobLoop/runtime'
import { FakeDispatchReceiver } from '../src/main/jobLoop/dispatchAck'
import { routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import type { ConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import { appendRecoveryTurn, appendTurn, applyOwnerDecision, assertThreadTransition, createThread, ThreadRejectedError, turnHash } from '../src/main/jobLoop/thread'

function approvedPacket(overrides: Partial<ApprovedTaskPacket> = {}, fixtureMode: FixtureMode = 'success', taskId = 'ADF-CONVERSATION-RELAY-001'): ApprovedTaskPacket {
  const scope = { inScope: ['Thread', 'Turn', 'Owner操作'], outOfScope: ['外部送信', '認証', '課金'] }
  const context = {
    githubTask: `manual-fixture://${taskId}`,
    obsidianContext: ['manual-fixture://16_ChatGPT_ADF_各AI自動往復構想_2026-08-07.md'],
    adoptedPrinciples: ['owner-approval', 'source-boundary']
  }
  const scopeHash = hashJson(scope)
  const adapterPlan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
  return {
    taskId,
    objective: 'ADF上でAI同士が議論し、結果をOwnerへ返す',
    scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: ['Threadが承認済みTaskに紐づく'],
    stopConditions: ['Approval不在', '最大Turn超過'],
    approval: {
      approvalId: `approval-${taskId.toLowerCase()}`,
      taskId,
      status: 'active',
      approvedBy: 'Project Owner',
      approvedAt: '2026-08-10T00:00:00.000Z',
      expiresAt: '2099-12-31T23:59:59.000Z',
      scopeHash,
      routingPlanHash: hashJson(adapterPlan),
      capabilities: ['read', 'propose']
    },
    adapter: 'multi-ai-routing-v1',
    fixtureMode,
    target: {
      repository: 'fixture://adf',
      branch: 'fixture/relay',
      worktree: 'fixture://relay-worktree',
      allowedFiles: ['docs/tasks/ADF-CONVERSATION-RELAY-001.md'],
      forbiddenChanges: ['commit', 'push', 'Obsidian canonical notes']
    },
    adapterPlan,
    ...overrides
  }
}

async function relay(options: ConstructorParameters<typeof ConversationRelay>[0] = {}): Promise<ConversationRelay> {
  return new ConversationRelay({ runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-relay-')), ...options })
}

async function startedThread(current: ConversationRelay, maxTurns = 6): Promise<string> {
  const thread = await current.startThread(approvedPacket(), { maxTurns })
  return thread.threadId
}

function threadFixture(maxTurns = 6): ConversationThread {
  return createThread({
    threadId: 't1',
    taskId: 'T',
    jobId: 'J',
    title: 'title',
    approvalId: 'approval-1',
    scopeHash: 'scope-hash',
    contextHash: 'context-hash',
    routingPlanHash: 'routing-hash',
    inputHash: 'input-hash',
    createdAt: '2026-08-10T00:00:00.000Z',
    maxTurns
  })
}

function turnFixture(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    turnId: 'turn-0-fixture',
    threadId: 't1',
    jobId: 'J',
    sequence: 0,
    adapterId: 'fake-ai-a',
    role: 'proposal',
    content: '提案本文',
    status: 'success',
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides
  }
}

describe('ADF-CONVERSATION-RELAY-001 thread rules', () => {
  it('requires an approval binding to create a thread', () => {
    expect(() => createThread({ threadId: 't1', taskId: 'T', jobId: 'J', title: 'x', approvalId: '', scopeHash: 's', contextHash: 'c', routingPlanHash: 'r', inputHash: 'i', createdAt: 'now' })).toThrow(/requires an approvalId/)
    expect(() => createThread({ threadId: 't1', taskId: 'T', jobId: 'J', title: 'x', approvalId: 'a', scopeHash: 's', contextHash: 'c', routingPlanHash: 'r', inputHash: '', createdAt: 'now' })).toThrow(/inputHash/)
  })

  it('refuses to approve a thread that produced no validated result envelope', () => {
    const withoutEvidence = { ...appendTurn(threadFixture(), turnFixture()), state: 'awaiting-owner' as const }
    expect(() => applyOwnerDecision(withoutEvidence, 'approve', '2026-08-10T01:00:00.000Z')).toThrow(/requires at least one turn with a validated result envelope/)

    const withEvidence = { ...appendTurn(threadFixture(), turnFixture({ resultEnvelopeRef: 'threads/t1/results/turn-0-fixture.json' })), state: 'awaiting-owner' as const }
    expect(applyOwnerDecision(withEvidence, 'approve', '2026-08-10T01:00:00.000Z').state).toBe('approved')
  })

  it('keeps turn order and rejects a gap in the sequence', () => {
    const first = appendTurn(threadFixture(), turnFixture())
    expect(first.turns.map((turn) => turn.sequence)).toEqual([0])
    expect(() => appendTurn(first, turnFixture({ turnId: 'turn-2', sequence: 2 }))).toThrow(/turn sequence must be 1/)
  })

  it('rejects a duplicate turnId', () => {
    const first = appendTurn(threadFixture(), turnFixture())
    const parent = first.turns[0]
    expect(() => appendTurn(first, turnFixture({ sequence: 1, respondsToTurnId: parent.turnId, respondsToHash: turnHash(parent) }))).toThrow(/duplicate turnId/)
  })

  it('rejects a child turn whose parent reference does not verify', () => {
    const first = appendTurn(threadFixture(), turnFixture())
    const parent = first.turns[0]
    expect(() => appendTurn(first, turnFixture({ turnId: 'turn-1', sequence: 1, respondsToTurnId: parent.turnId, respondsToHash: 'tampered-hash' }))).toThrow(/respondsToHash does not match/)
    expect(() => appendTurn(first, turnFixture({ turnId: 'turn-1', sequence: 1, respondsToTurnId: 'missing-turn', respondsToHash: turnHash(parent) }))).toThrow(/respondsToTurnId not found/)
    expect(() => appendTurn(first, turnFixture({ turnId: 'turn-1', sequence: 1 }))).toThrow(/must reference a parent turn/)
  })

  it('rejects invalid thread transitions', () => {
    expect(() => assertThreadTransition('stopped', 'open')).toThrow(ThreadRejectedError)
    expect(() => assertThreadTransition('completed', 'open')).toThrow(/invalid thread transition/)
    expect(() => assertThreadTransition('open', 'completed')).toThrow(/invalid thread transition/)
  })

  it('fails a thread when the Owner continues past the max turn count', () => {
    const withTurn = { ...appendTurn(threadFixture(1), turnFixture()), state: 'awaiting-owner' as const }
    const decided = applyOwnerDecision(withTurn, 'continue', '2026-08-10T01:00:00.000Z')
    expect(decided.state).toBe('failed')
    expect(decided.stopReason).toMatch(/max turns reached/)
  })
})

describe('ADF-CONVERSATION-RELAY-001 approval boundary', () => {
  it('binds a thread to the approval that authorised it', async () => {
    const current = await relay()
    const thread = await current.startThread(approvedPacket())
    expect(thread.approvalId).toBe('approval-adf-conversation-relay-001')
    expect(thread.scopeHash).toBe(approvedPacket().scopeHash)
    expect(thread.routingPlanHash).toBe(approvedPacket().approval.routingPlanHash)
  })

  it('registers the Job through Dispatch ACK and binds the thread to that Job', async () => {
    const current = await relay()
    const thread = await current.startThread(approvedPacket())
    const job = await current.jobRuntime.readJob(thread.jobId)

    expect(job.dispatchState).toBe('preflight-valid')
    expect(job.state).toBe('queued')
    expect(job.request.inputHash).toBe(thread.inputHash)
    expect(job.events.map((event) => event.type)).toEqual(expect.arrayContaining(['dispatch.sent', 'dispatch.acknowledged', 'dispatch.preflight-valid', 'job.registered']))

    const directory = current.jobRuntime.jobDirectory(thread.jobId)
    for (const file of ['approval.json', 'request.json', 'dispatch-packet.json', 'dispatch-ack.json']) {
      await expect(readFile(path.join(directory, file), 'utf8')).resolves.toContain(thread.taskId)
    }
  })

  it('refuses to start a thread when the Dispatch ACK does not verify', async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-relay-ack-'))
    const jobRuntime = new JobRuntime({ runtimeRoot, receiver: new FakeDispatchReceiver(() => null) })
    const current = new ConversationRelay({ runtimeRoot, jobRuntime })
    await expect(current.startThread(approvedPacket())).rejects.toThrow(/Delivery not confirmed/i)
    expect(await current.listThreads()).toHaveLength(0)
  })

  it('refuses to start a thread without a valid approval', async () => {
    const current = await relay()
    const revoked = approvedPacket()
    revoked.approval.status = 'revoked'
    await expect(current.startThread(revoked)).rejects.toThrow(/Task packet rejected/)

    const expired = approvedPacket()
    expired.approval.expiresAt = '2000-01-01T00:00:00.000Z'
    await expect(current.startThread(expired)).rejects.toThrow(/expired/)

    const tamperedScope = approvedPacket()
    tamperedScope.scopeHash = 'wrong-hash'
    await expect(current.startThread(tamperedScope)).rejects.toThrow(/scope hash mismatch/)

    const tamperedRouting = approvedPacket()
    tamperedRouting.approval.routingPlanHash = 'wrong-routing-hash'
    await expect(current.startThread(tamperedRouting)).rejects.toThrow(/routing plan hash mismatch/)

    expect(await current.listThreads()).toHaveLength(0)
  })
})

describe('ADF-CONVERSATION-RELAY-001 relay conversation', () => {
  it('runs a proposal, a critique, and an Owner-approved re-request as one thread', async () => {
    const current = await relay()
    const threadId = await startedThread(current)

    const afterProposal = await current.continueJob(threadId)
    expect(afterProposal.turns).toHaveLength(1)
    expect(afterProposal.turns[0].adapterId).toBe('fake-ai-a')
    expect(afterProposal.state).toBe('awaiting-owner')

    const afterCritique = await current.continueWithOwnerApproval(threadId)
    expect(afterCritique.turns).toHaveLength(2)
    expect(afterCritique.turns[1].adapterId).toBe('fake-ai-b')
    expect(afterCritique.turns[1].respondsToTurnId).toBe(afterCritique.turns[0].turnId)
    expect(afterCritique.turns[1].respondsToHash).toBe(turnHash(afterCritique.turns[0]))
    expect(afterCritique.turns[1].content).toContain(afterCritique.turns[0].content)

    const afterReRequest = await current.continueWithOwnerApproval(threadId)
    expect(afterReRequest.turns[2].adapterId).toBe('fake-ai-a')
    expect(afterReRequest.turns[2].content).toContain('再提案')

    const afterReCritique = await current.continueWithOwnerApproval(threadId)
    expect(afterReCritique.turns).toHaveLength(4)
    expect(afterReCritique.turns[3].respondsToHash).toBe(turnHash(afterReCritique.turns[2]))
    expect(afterReCritique.ownerDecisions.map((decision) => decision.action)).toEqual(['continue', 'continue', 'continue'])
  })

  it('records a validated Result Envelope and Evidence link for every turn', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const thread = await current.continueJob(threadId)
    const turn = thread.turns[0]

    expect(turn.resultEnvelopeRef).toBe(`threads/${threadId}/results/${turn.turnId}.json`)
    const envelope = JSON.parse(await readFile(path.join(current.threadDirectory(threadId), 'results', `${turn.turnId}.json`), 'utf8'))
    expect(envelope).toMatchObject({
      taskId: thread.taskId,
      jobId: thread.jobId,
      inputHash: thread.inputHash,
      scopeHash: thread.scopeHash,
      adapterId: 'fake-ai-a',
      role: 'proposal',
      status: 'success',
      ownerDecisionRequired: true,
      terminationReason: 'completed'
    })
    expect(envelope.verification).toEqual([{ name: 'scope-boundary', status: 'pass' }])

    const evidence = JSON.parse(await readFile(path.join(current.threadDirectory(threadId), 'evidence-links.json'), 'utf8'))
    expect(evidence).toMatchObject({ threadId, taskId: thread.taskId, jobId: thread.jobId, jobLedger: `jobs/${thread.jobId}/` })
    expect(evidence.turns[0]).toMatchObject({ turnId: turn.turnId, resultEnvelopeRef: turn.resultEnvelopeRef })
  })

  it('moves the Job Ledger in step with the conversation', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const thread = await current.getConversationState(threadId)
    expect((await current.jobRuntime.readJob(thread.jobId)).state).toBe('queued')

    await current.continueJob(threadId)
    expect((await current.jobRuntime.readJob(thread.jobId)).state).toBe('running')

    await current.recordOwnerDecision(threadId, 'approve')
    expect((await current.jobRuntime.readJob(thread.jobId)).state).toBe('awaiting-review')
  })

  it('cancels the Job when the Owner stops the thread and fails it on a failed turn', async () => {
    const stopping = await relay()
    const stopId = await startedThread(stopping)
    const stopThread = await stopping.getConversationState(stopId)
    await stopping.continueJob(stopId)
    await stopping.recordOwnerDecision(stopId, 'stop')
    expect((await stopping.jobRuntime.readJob(stopThread.jobId)).state).toBe('cancelled')

    const failing = await relay({ adapters: [new FakeProposalConversationAdapter('failed'), new FakeCriticConversationAdapter()] })
    const failId = await startedThread(failing)
    const failThread = await failing.getConversationState(failId)
    await failing.continueJob(failId)
    expect((await failing.jobRuntime.readJob(failThread.jobId)).state).toBe('failed')
  })

  it('re-reads the stored Result Envelope before the Owner may approve', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const thread = await current.continueJob(threadId)
    const envelopePath = path.join(current.threadDirectory(threadId), 'results', `${thread.turns[0].turnId}.json`)

    const original = JSON.parse(await readFile(envelopePath, 'utf8'))
    await writeFile(envelopePath, JSON.stringify({ ...original, summary: '差し替えられた要約' }, null, 2), 'utf8')
    await expect(current.recordOwnerDecision(threadId, 'approve')).rejects.toThrow(/was modified after it was recorded/)

    await rm(envelopePath)
    await expect(current.recordOwnerDecision(threadId, 'approve')).rejects.toThrow(/result envelope file is missing/)

    await writeFile(envelopePath, JSON.stringify(original, null, 2), 'utf8')
    expect((await current.recordOwnerDecision(threadId, 'approve')).state).toBe('approved')
  })

  it('does not let another Owner action interleave inside a single continue', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.continueJob(threadId)

    const [continued, stopped] = await Promise.allSettled([
      current.continueWithOwnerApproval(threadId),
      current.recordOwnerDecision(threadId, 'stop')
    ])

    expect(continued.status).toBe('fulfilled')
    expect(stopped.status).toBe('fulfilled')
    const final = await current.getConversationState(threadId)
    expect(final.state).toBe('stopped')
    expect(final.turns).toHaveLength(2)
  })

  it('refuses a success turn that carries no passing verification', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const handle = await current.sendToAdapter(threadId)
    await expect(current.receiveFromAdapter(handle, { content: '検証のない提案', status: 'success' })).rejects.toThrow(/requires at least one passing verification/)
  })

  it('lets only one of two concurrent dispatches claim the same turn', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const results = await Promise.allSettled([current.sendToAdapter(threadId), current.sendToAdapter(threadId)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)

    const thread = await current.getConversationState(threadId)
    expect(thread.turns).toHaveLength(0)
  })

  it('lets only one of two concurrent continue calls add a turn', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const results = await Promise.allSettled([current.continueJob(threadId), current.continueJob(threadId)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await current.getConversationState(threadId)).turns).toHaveLength(1)
  })

  it('stops a thread mid-conversation on the Owner decision', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.continueJob(threadId)
    const stopped = await current.recordOwnerDecision(threadId, 'stop', 'Ownerが停止')
    expect(stopped.state).toBe('stopped')
    await expect(current.continueJob(threadId)).rejects.toThrow(/thread is not open/)
  })

  it('approves a thread mid-conversation and then closes it as the next Task', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.continueJob(threadId)
    expect((await current.recordOwnerDecision(threadId, 'approve')).state).toBe('approved')
    const completed = await current.recordOwnerDecision(threadId, 'next-task')
    expect(completed.state).toBe('completed')
    expect(completed.ownerDecisions.map((decision) => decision.action)).toEqual(['approve', 'next-task'])
  })

  it('rejects a duplicate dispatch while one is pending', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.sendToAdapter(threadId)
    await expect(current.sendToAdapter(threadId)).rejects.toThrow(/dispatch is already pending/)
  })

  it('rejects a tampered receive handle and trusts only the stored dispatch', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    const handle = await current.sendToAdapter(threadId)

    for (const tampered of [
      { ...handle, dispatchId: 'other-dispatch' },
      { ...handle, adapterId: 'fake-ai-b' },
      { ...handle, role: 'critic' as const },
      { ...handle, sequence: 5 },
      { ...handle, jobId: 'job-somewhere-else' },
      { ...handle, taskId: 'ADF-OTHER-TASK' }
    ]) {
      await expect(current.receiveFromAdapter(tampered)).rejects.toThrow(/does not match the stored pending dispatch|no pending dispatch/)
    }

    const accepted = await current.receiveFromAdapter(handle)
    expect(accepted.turns).toHaveLength(1)
    expect(accepted.turns[0].adapterId).toBe('fake-ai-a')
    expect(accepted.turns[0].role).toBe('proposal')
  })

  it('refuses an adapter whose role does not match the next turn', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await expect(current.sendToAdapter(threadId, 'fake-ai-b')).rejects.toThrow(/requires role proposal/)
    await current.continueJob(threadId)
    await current.recordOwnerDecision(threadId, 'continue')
    await expect(current.sendToAdapter(threadId, 'fake-ai-a')).rejects.toThrow(/requires role critic/)
  })

  it('keeps a partial result open for the Owner and fails the thread on failed or invalid', async () => {
    const partial = await relay({ adapters: [new FakeProposalConversationAdapter('partial'), new FakeCriticConversationAdapter()] })
    const afterPartial = await partial.continueJob(await startedThread(partial))
    expect(afterPartial.turns[0].status).toBe('partial')
    expect(afterPartial.state).toBe('awaiting-owner')

    for (const status of ['failed', 'invalid'] as const) {
      const current = await relay({ adapters: [new FakeProposalConversationAdapter(status), new FakeCriticConversationAdapter()] })
      const thread = await current.continueJob(await startedThread(current))
      expect(thread.turns[0].status).toBe(status)
      expect(thread.state).toBe('failed')
      expect(thread.stopReason).toContain(status)
    }
  })

  it('stops at the max turn count instead of continuing forever', async () => {
    const current = await relay()
    const threadId = await startedThread(current, 2)
    await current.continueJob(threadId)
    const atLimit = await current.continueWithOwnerApproval(threadId)
    expect(atLimit.turns).toHaveLength(2)
    expect(atLimit.stopReason).toMatch(/max turns reached/)
    const beyond = await current.continueWithOwnerApproval(threadId)
    expect(beyond.state).toBe('failed')
    expect(beyond.turns).toHaveLength(2)
  })

  it('refuses to dispatch a planned external adapter', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await expect(current.sendToAdapter(threadId, 'claude-external')).rejects.toThrow(/not available for dispatch/)
    await expect(current.sendToAdapter(threadId, 'codex-external')).rejects.toThrow(/not available for dispatch/)
  })

  it('reads thread state back and lists threads for the Board', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.continueJob(threadId)
    expect((await current.getConversationState(threadId)).taskId).toBe('ADF-CONVERSATION-RELAY-001')
    const summaries = await current.listThreads()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ threadId, turnCount: 1, state: 'awaiting-owner', ownerActionRequired: true, lastAdapterId: 'fake-ai-a' })
  })

  it('is idempotent when the same approved task starts a thread twice', async () => {
    const current = await relay()
    const first = await current.startThread(approvedPacket())
    const second = await current.startThread(approvedPacket())
    expect(second.threadId).toBe(first.threadId)
    expect(await current.listThreads()).toHaveLength(1)
  })
})

/** Simulates a restart: same runtime directory, fresh adapters whose in-memory answers are gone. */
async function restart(previous: ConversationRelay, adapters?: readonly ConversationAdapter[]): Promise<ConversationRelay> {
  return new ConversationRelay({ runtimeRoot: previous.runtimeRoot, ...(adapters ? { adapters } : {}) })
}

class ThrowingSendAdapter extends FakeProposalConversationAdapter {
  override async send(): Promise<never> {
    throw new Error('network unreachable: token=SHOULD-NOT-BE-LOGGED')
  }
}

class ThrowingGetStateAdapter extends FakeProposalConversationAdapter {
  override async getState(): Promise<never> {
    throw new Error(`probe failed ${'x'.repeat(400)}`)
  }
}

describe('ADF-RELAY-RECOVERY-001 detection', () => {
  it('detects an interrupted send whose answer is gone (Case A)', async () => {
    const first = await relay()
    const threadId = await startedThread(first)
    await first.sendToAdapter(threadId)

    const restarted = await restart(first)
    const detected = await restarted.scanForRecovery()
    expect(detected).toHaveLength(1)

    const thread = await restarted.getConversationState(threadId)
    expect(thread.state).toBe('recovery-needed')
    expect(thread.recovery).toMatchObject({ reason: 'answer-unavailable', sequence: 0, adapterId: 'fake-ai-a', role: 'proposal', attempt: 0 })
    expect(thread.recovery?.expiresAt).toBeTruthy()
    expect((await restarted.jobRuntime.readJob(thread.jobId)).state).toBe('recovery-needed')
  })

  it('detects a send that was never confirmed (Case B) and keeps the error text safe', async () => {
    const current = await relay({ adapters: [new ThrowingSendAdapter(), new FakeCriticConversationAdapter()] })
    const threadId = await startedThread(current)
    await expect(current.sendToAdapter(threadId)).rejects.toThrow(/network unreachable/)

    const duringSession = await current.getConversationState(threadId)
    expect(duringSession.state).toBe('open')

    const restarted = await restart(current, [new ThrowingSendAdapter(), new FakeCriticConversationAdapter()])
    expect(await restarted.scanForRecovery()).toHaveLength(1)
    const thread = await restarted.getConversationState(threadId)
    expect(thread.state).toBe('recovery-needed')
    expect(thread.recovery?.reason).toBe('send-unconfirmed')

    const events = (await readFile(path.join(current.threadDirectory(threadId), 'thread-events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    const failure = events.find((event) => event.type === 'relay.send-failed')
    expect(failure.sendError.length).toBeLessThanOrEqual(200)
    expect(failure.sendError).not.toContain('    at ')
    expect(failure.sendError).toContain('network unreachable')
  })

  it('treats a getState exception as recovery and keeps scanning other threads', async () => {
    const adapters = [new ThrowingGetStateAdapter(), new FakeCriticConversationAdapter()]
    const current = await relay({ adapters })
    const first = await current.startThread(approvedPacket({}, 'success', 'ADF-RECOVERY-FIXTURE-A'))
    const second = await current.startThread(approvedPacket({}, 'success', 'ADF-RECOVERY-FIXTURE-B'))
    await current.sendToAdapter(first.threadId)
    await current.sendToAdapter(second.threadId)

    const restarted = await restart(current, [new ThrowingGetStateAdapter(), new FakeCriticConversationAdapter()])
    expect(await restarted.scanForRecovery()).toHaveLength(2)

    const recovered = await restarted.getConversationState(first.threadId)
    expect(recovered.state).toBe('recovery-needed')
    expect(recovered.recovery?.probeError).toHaveLength(200)
  })

  it('does not report a superseded send-failed attempt once the same sequence succeeded', async () => {
    const failing = new ThrowingSendAdapter()
    const working = new FakeProposalConversationAdapter()
    let proposal: ConversationAdapter = failing
    // One adapter identity whose first send throws and whose retry succeeds, as a flaky AI would.
    const flaky: ConversationAdapter = {
      adapterId: 'fake-ai-a',
      role: 'proposal',
      send: (request) => proposal.send(request),
      getState: (acceptance) => proposal.getState(acceptance),
      receive: (acceptance) => proposal.receive(acceptance)
    }

    const current = await relay({ adapters: [flaky, new FakeCriticConversationAdapter()] })
    const threadId = await startedThread(current)
    await expect(current.sendToAdapter(threadId)).rejects.toThrow(/network unreachable/)

    proposal = working
    const answered = await current.continueJob(threadId)
    expect(answered.turns).toHaveLength(1)
    expect(answered.turns[0].sequence).toBe(0)

    // Put the Thread back to `open` so the scan actually inspects it.
    await current.recordOwnerDecision(threadId, 'continue')
    const restarted = await restart(current, [new FakeProposalConversationAdapter(), new FakeCriticConversationAdapter()])
    expect(await restarted.scanForRecovery()).toHaveLength(0)
    expect((await restarted.getConversationState(threadId)).state).toBe('open')
  })

  it('reports only the newest attempt when a retry after send-failed is also interrupted', async () => {
    const current = await relay({ adapters: [new ThrowingSendAdapter(), new FakeCriticConversationAdapter()] })
    const threadId = await startedThread(current)
    await expect(current.sendToAdapter(threadId)).rejects.toThrow(/network unreachable/)
    await expect(current.sendToAdapter(threadId)).rejects.toThrow(/network unreachable/)

    const events = (await readFile(path.join(current.threadDirectory(threadId), 'thread-events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    const intents = events.filter((event) => event.type === 'relay.dispatch-intent')
    expect(intents.map((intent) => intent.attempt)).toEqual([0, 1])

    const restarted = await restart(current, [new ThrowingSendAdapter(), new FakeCriticConversationAdapter()])
    const detected = await restarted.scanForRecovery()
    expect(detected).toHaveLength(1)

    const thread = await restarted.getConversationState(threadId)
    expect(thread.state).toBe('recovery-needed')
    expect(thread.recovery).toMatchObject({ reason: 'send-unconfirmed', dispatchId: intents[1].dispatchId, sequence: 0, attempt: 1 })
    expect(thread.recovery?.dispatchId).not.toBe(intents[0].dispatchId)
  })

  it('leaves a thread open when the adapter can still produce the answer', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await current.sendToAdapter(threadId)
    expect(await current.scanForRecovery()).toHaveLength(0)
    expect((await current.getConversationState(threadId)).state).toBe('open')
  })

  it('does not act on an expired pending by itself', async () => {
    const expiring = new ConversationRelay({ runtimeRoot: await mkdtemp(path.join(tmpdir(), 'adf-relay-ttl-')), pendingTtlMs: 1 })
    const thread = await expiring.startThread(approvedPacket())
    const handle = await expiring.sendToAdapter(thread.threadId)
    expect(new Date(handle.expiresAt).getTime()).toBeLessThan(Date.now() + 1000)
    expect((await expiring.getConversationState(thread.threadId)).state).toBe('open')
    expect((await expiring.listThreads())[0].recoveryRequired).toBe(false)
  })
})

describe('ADF-RELAY-RECOVERY-001 owner recovery actions', () => {
  async function interrupted(): Promise<{ current: ConversationRelay; threadId: string; oldDispatchId: string }> {
    const first = await relay()
    const threadId = await startedThread(first)
    const handle = await first.sendToAdapter(threadId)
    const current = await restart(first)
    await current.scanForRecovery()
    return { current, threadId, oldDispatchId: handle.dispatchId }
  }

  it('resends with the same sequence but a new dispatchId', async () => {
    const { current, threadId, oldDispatchId } = await interrupted()
    const resent = await current.resendFromRecovery(threadId)

    expect(resent.state).toBe('awaiting-owner')
    expect(resent.turns).toHaveLength(1)
    expect(resent.turns[0].sequence).toBe(0)
    expect(resent.turns[0].dispatchId).not.toBe(oldDispatchId)
    expect(resent.recovery).toBeUndefined()
    expect((await current.jobRuntime.readJob(resent.jobId)).state).toBe('running')
  })

  it('records a failure as a failed turn with evidence and blocks approval', async () => {
    const { current, threadId } = await interrupted()
    const recorded = await current.recordRecoveryFailure(threadId, 'Ownerが失敗として記録')

    expect(recorded.state).toBe('awaiting-owner')
    expect(recorded.recovery).toBeUndefined()
    const turn = recorded.turns[0]
    expect(turn.status).toBe('failed')
    expect(turn.content).toContain('Adapterの発言ではない')
    expect(turn.errorRef).toBe(`threads/${threadId}/errors/${turn.turnId}.json`)

    const envelope = JSON.parse(await readFile(path.join(current.threadDirectory(threadId), 'results', `${turn.turnId}.json`), 'utf8'))
    expect(envelope).toMatchObject({ status: 'failed', terminationReason: 'recovery-failed', ownerDecisionRequired: true })
    expect(envelope.verification).toEqual([{ name: 'adapter-answer-recovered', status: 'not-run', reason: 'answer-unavailable' }])

    const errorRecord = JSON.parse(await readFile(path.join(current.threadDirectory(threadId), 'errors', `${turn.turnId}.json`), 'utf8'))
    expect(errorRecord).toMatchObject({ reason: 'answer-unavailable', sequence: 0, adapterId: 'fake-ai-a', attempt: 0, note: 'Ownerが失敗として記録' })

    await expect(current.recordOwnerDecision(threadId, 'approve')).rejects.toThrow(/approve requires/)
  })

  it('stops the thread and cancels the job', async () => {
    const { current, threadId } = await interrupted()
    const stopped = await current.stopFromRecovery(threadId)
    expect(stopped.state).toBe('stopped')
    expect(stopped.recovery).toBeUndefined()
    expect((await current.jobRuntime.readJob(stopped.jobId)).state).toBe('cancelled')
    await expect(current.continueJob(threadId)).rejects.toThrow(/thread is not open/)
  })

  it('refuses ordinary owner actions and continue while recovery is pending', async () => {
    const { current, threadId } = await interrupted()
    await expect(current.recordOwnerDecision(threadId, 'stop')).rejects.toThrow(/use a recovery action/)
    await expect(current.recordOwnerDecision(threadId, 'approve')).rejects.toThrow(/use a recovery action/)
    await expect(current.continueJob(threadId)).rejects.toThrow(/use a recovery action first/)
  })

  it('refuses a recovery action on a thread that is not in recovery', async () => {
    const current = await relay()
    const threadId = await startedThread(current)
    await expect(current.resendFromRecovery(threadId)).rejects.toThrow(/not awaiting recovery/)
    await expect(current.recordRecoveryFailure(threadId)).rejects.toThrow(/not awaiting recovery/)
    await expect(current.stopFromRecovery(threadId)).rejects.toThrow(/not awaiting recovery/)
  })

  it('detects a second interruption at the same sequence after a resend', async () => {
    const { current, threadId } = await interrupted()
    await current.resendFromRecovery(threadId)
    await current.recordOwnerDecision(threadId, 'continue')
    await current.sendToAdapter(threadId)

    const restarted = await restart(current)
    expect(await restarted.scanForRecovery()).toHaveLength(1)
    const thread = await restarted.getConversationState(threadId)
    expect(thread.state).toBe('recovery-needed')
    expect(thread.recovery?.sequence).toBe(1)
    expect(thread.recovery?.attempt).toBe(0)
  })
})

describe('ADF-RELAY-RECOVERY-001 recovery turn rules', () => {
  const recoveryTurn = (overrides: Partial<ConversationTurn> = {}): ConversationTurn =>
    turnFixture({ status: 'failed', errorRef: 'threads/t1/errors/turn-0.json', ...overrides })

  it('accepts an ADF failure turn only from recovery-needed', () => {
    const base = { ...threadFixture(), state: 'recovery-needed' as const }
    expect(appendRecoveryTurn(base, recoveryTurn()).turns).toHaveLength(1)
    expect(() => appendRecoveryTurn(threadFixture(), recoveryTurn())).toThrow(/thread is not recovery-needed/)
  })

  it('rejects a recovery turn that is not a failure or has no error reference', () => {
    const base = { ...threadFixture(), state: 'recovery-needed' as const }
    expect(() => appendRecoveryTurn(base, recoveryTurn({ status: 'success' }))).toThrow(/must be failed/)
    expect(() => appendRecoveryTurn(base, turnFixture({ status: 'failed' }))).toThrow(/requires an errorRef/)
  })

  it('keeps order, duplicate and parent checks on the recovery path', () => {
    const base = { ...threadFixture(), state: 'recovery-needed' as const }
    expect(() => appendRecoveryTurn(base, recoveryTurn({ sequence: 3 }))).toThrow(/turn sequence must be 0/)
    const withOne = { ...appendRecoveryTurn(base, recoveryTurn()), state: 'recovery-needed' as const }
    expect(() => appendRecoveryTurn(withOne, recoveryTurn({ turnId: 'turn-1', sequence: 1 }))).toThrow(/must reference a parent turn/)
    expect(() => appendRecoveryTurn(withOne, recoveryTurn({ sequence: 1, respondsToTurnId: withOne.turns[0].turnId, respondsToHash: turnHash(withOne.turns[0]) }))).toThrow(/duplicate turnId/)
  })

  it('still refuses an ordinary turn outside open', () => {
    const base = { ...threadFixture(), state: 'recovery-needed' as const }
    expect(() => appendTurn(base, turnFixture())).toThrow(/thread is not open/)
  })
})

describe('ADF-CONVERSATION-RELAY-001 adapter contract', () => {
  it('exposes send, getState and receive so an external adapter can answer later', async () => {
    const adapter = new FakeProposalConversationAdapter()
    const request = { dispatchId: 'd1', taskId: 'T', threadId: 'th1', jobId: 'J', title: 'タイトル', role: 'proposal' as const, sequence: 0, priorTurns: [] }
    const acceptance = await adapter.send(request)
    expect(acceptance).toMatchObject({ dispatchId: 'd1', adapterId: 'fake-ai-a' })
    expect(await adapter.getState(acceptance)).toBe('ready')
    const payload = await adapter.receive(acceptance)
    expect(payload.status).toBe('success')
    expect(payload.content).toContain('タイトル')
    expect(await adapter.getState(acceptance)).toBe('failed')
    await expect(adapter.receive(acceptance)).rejects.toThrow(/no pending answer/)
  })

  it('refuses a request whose role does not match the adapter', async () => {
    const adapter = new FakeCriticConversationAdapter()
    await expect(adapter.send({ dispatchId: 'd1', taskId: 'T', threadId: 'th1', jobId: 'J', title: 't', role: 'proposal', sequence: 0, priorTurns: [] })).rejects.toThrow(/cannot take role proposal/)
  })
})
