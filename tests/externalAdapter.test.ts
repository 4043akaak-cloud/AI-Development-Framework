import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AdapterRole, ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { ExternalSendApproval } from '../src/shared/externalAdapterTypes'
import { routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { writeJsonAtomic } from '../src/main/jobLoop/ledger'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { ExternalConversationAdapter } from '../src/main/jobLoop/externalAdapter'
import { externalApprovalPath, ExternalSendBlockedError } from '../src/main/jobLoop/externalApproval'
import { MockExternalTransport, TransportNotConfiguredError, UnconfiguredExternalTransport } from '../src/main/jobLoop/externalTransport'
import { assertPacketBoundary, buildSyntheticPacket, PacketBoundaryError } from '../src/main/jobLoop/syntheticPacket'
import { AnthropicMessagesTransport } from '../src/main/jobLoop/anthropicTransport'
import { FakeCriticConversationAdapter, type AdapterRequest } from '../src/main/jobLoop/conversationAdapters'

const taskId = 'ADF-EXTERNAL-ADAPTER-001'
const adapterId = 'external-probe-mock'

function approvedPacket(): ApprovedTaskPacket {
  const scope = { inScope: ['外部Adapter接続'], outOfScope: ['repo送信', '正本変更'] }
  const context = { githubTask: `manual-fixture://${taskId}`, obsidianContext: [], adoptedPrinciples: ['owner-approval'] }
  const scopeHash = hashJson(scope)
  const adapterPlan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
  return {
    taskId,
    objective: '実AI Adapterの最小接続を実証する',
    scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: ['Synthetic Packetだけを送る'],
    stopConditions: ['未承認の外部送信'],
    approval: {
      approvalId: 'approval-external-adapter-001',
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
    fixtureMode: 'success',
    target: { repository: 'fixture://adf', branch: 'fixture/external', worktree: 'fixture://external', allowedFiles: [], forbiddenChanges: ['commit'] },
    adapterPlan
  }
}

async function relayWith(transport: MockExternalTransport | UnconfiguredExternalTransport | AnthropicMessagesTransport, selectedAdapterId = adapterId, roles: AdapterRole | readonly AdapterRole[] = 'proposal'): Promise<{ relay: ConversationRelay; threadId: string }> {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'adf-external-'))
  const relay = new ConversationRelay({ runtimeRoot })
  const adapter = new ExternalConversationAdapter(selectedAdapterId, roles, transport, relay.externalHooks(selectedAdapterId, transport))
  const withExternal = new ConversationRelay({ runtimeRoot, adapters: [adapter, new FakeCriticConversationAdapter()] })
  const rebound = new ExternalConversationAdapter(selectedAdapterId, roles, transport, withExternal.externalHooks(selectedAdapterId, transport))
  const final = new ConversationRelay({ runtimeRoot, adapters: [rebound, new FakeCriticConversationAdapter()] })
  const thread = await final.startThread(approvedPacket())
  return { relay: final, threadId: thread.threadId }
}

async function grantApproval(relay: ConversationRelay, threadId: string, overrides: Partial<ExternalSendApproval> = {}, selectedAdapterId = adapterId): Promise<ExternalSendApproval> {
  const thread = await relay.getConversationState(threadId)
  const packet = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
  const approval: ExternalSendApproval = {
    approvalId: 'external-send-approval-001',
    taskId: thread.taskId,
    threadId,
    adapterId: selectedAdapterId,
    provider: 'mock-provider',
    role: 'proposal',
    packetHash: packet.packetHash,
    scopeHash: thread.scopeHash,
    contextHash: thread.contextHash,
    maxSends: 1,
    costTier: 'free',
    approvedBy: 'Project Owner',
    approvedAt: '2026-08-10T00:00:00.000Z',
    expiresAt: '2099-12-31T23:59:59.000Z',
    ...overrides
  }
  await writeJsonAtomic(externalApprovalPath(relay.runtimeRoot, threadId), approval)
  return approval
}

describe('ADF-EXTERNAL-ADAPTER-001 synthetic packet', () => {
  it('carries only identifiers and fixed text', async () => {
    const { relay, threadId } = await relayWith(new MockExternalTransport({ status: 'success', content: 'ok' }))
    const thread = await relay.getConversationState(threadId)
    const packet = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')

    expect(packet.kind).toBe('synthetic-connectivity-probe')
    expect(() => assertPacketBoundary(packet)).not.toThrow()
    const serialised = JSON.stringify(packet)
    expect(serialised).not.toContain('/Users/')
    expect(serialised).not.toContain('secondbrain')
    expect(serialised).not.toContain('github.com')
    expect(serialised).not.toContain(thread.title)
  })

  it('refuses a packet that acquired a path, url, or credential marker', () => {
    const base = buildSyntheticPacket({ taskId, threadId: 't1', jobId: 'j1', turns: [] } as never, 'proposal', 0, 'now')
    for (const smuggled of ['/Users/someone/repo', 'https://example.com', 'ANTHROPIC_API_KEY=x', 'notes.md']) {
      expect(() => assertPacketBoundary({ ...base, instruction: `${base.instruction}\n${smuggled}` })).toThrow(PacketBoundaryError)
    }
  })
})

describe('ADF-EXTERNAL-ADAPTER-001 owner gate', () => {
  it('blocks a send when no execution approval exists', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)

    const preflight = await relay.preflightExternalSend(threadId, adapterId, transport)
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/no execution approval/)

    await expect(relay.continueJob(threadId, adapterId)).rejects.toBeInstanceOf(ExternalSendBlockedError)
    expect(transport.received).toHaveLength(0)
    expect((await relay.getConversationState(threadId)).turns).toHaveLength(0)
  })

  it('blocks a send whose approval is bound to a different packet, adapter, provider, or time', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)

    for (const override of [
      { packetHash: 'a-different-packet' },
      { scopeHash: 'a-different-scope' },
      { contextHash: 'a-different-context' },
      { adapterId: 'some-other-adapter' },
      { provider: 'another-provider' },
      { expiresAt: '2000-01-01T00:00:00.000Z' },
      { maxSends: 0 }
    ] as Array<Partial<ExternalSendApproval>>) {
      await grantApproval(relay, threadId, override)
      const preflight = await relay.preflightExternalSend(threadId, adapterId, transport)
      expect(preflight.ok).toBe(false)
      await expect(relay.continueJob(threadId, adapterId)).rejects.toBeInstanceOf(ExternalSendBlockedError)
    }
    expect(transport.received).toHaveLength(0)
  })

  it('reports a Scope change as a Scope change and blocks the send', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId, { scopeHash: 'the-scope-that-was-approved' })

    const preflight = await relay.preflightExternalSend(threadId, adapterId, transport)
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/approval-matches-scope: the approved Scope hash does not match/)
    await expect(relay.continueJob(threadId, adapterId)).rejects.toBeInstanceOf(ExternalSendBlockedError)
    expect(transport.received).toHaveLength(0)
  })

  it('binds the packet hash to the approved Scope and Context', async () => {
    const { relay, threadId } = await relayWith(new MockExternalTransport({ status: 'success', content: 'ok' }))
    const thread = await relay.getConversationState(threadId)
    const packet = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
    expect(packet.scopeHash).toBe(thread.scopeHash)

    const moved = buildSyntheticPacket({ ...thread, scopeHash: 'scope-changed' }, 'proposal', 0, '2026-08-10T00:00:00.000Z')
    expect(moved.packetHash).not.toBe(packet.packetHash)
  })

  it('refuses to dispatch a provider whose transport is not configured', async () => {
    const transport = new UnconfiguredExternalTransport('mock-provider', 'connection method not decided')
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    const preflight = await relay.preflightExternalSend(threadId, adapterId, transport)
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/transport connection is unknown/)
  })

  it('never auto-routes an external adapter by role', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    await expect(relay.continueJob(threadId)).rejects.toThrow(/no local relay adapter registered for role proposal/)
    expect(transport.received).toHaveLength(0)
  })
})

describe('ADF-EXTERNAL-ADAPTER-001 approved send', () => {
  it('sends the approved packet once and parks the answer for Owner review', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: '受信しました。役割: proposal。' })
    const { relay, threadId } = await relayWith(transport)
    const approval = await grantApproval(relay, threadId)

    expect((await relay.preflightExternalSend(threadId, adapterId, transport)).ok).toBe(true)
    const thread = await relay.continueJob(threadId, adapterId)

    expect(transport.received).toHaveLength(1)
    expect(transport.received[0].packetHash).toBe(approval.packetHash)
    expect(thread.state).toBe('awaiting-owner')
    expect(thread.turns[0].adapterId).toBe(adapterId)
    expect(thread.turns[0].status).toBe('success')

    const envelope = JSON.parse(await readFile(path.join(relay.threadDirectory(threadId), 'results', `${thread.turns[0].turnId}.json`), 'utf8'))
    expect(envelope).toMatchObject({ status: 'success', taskId: thread.taskId, jobId: thread.jobId, inputHash: thread.inputHash, ownerDecisionRequired: true })

    const calls = (await readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ provider: 'mock-provider', adapterId, status: 'success', costTier: 'free', approvalId: approval.approvalId })
    expect(JSON.stringify(calls[0])).not.toMatch(/api[_-]?key|sk-ant|authorization/i)
  })

  it('persists numeric provider metrics in the external-call Ledger without payload data', async () => {
    const transport = new MockExternalTransport({
      status: 'success',
      content: '受信しました。',
      metrics: { totalDurationNs: 12_000_000, loadDurationNs: 3_000_000, evalCount: 8 }
    })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    await relay.continueJob(threadId, adapterId)

    const calls = (await readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    expect(calls[0].metrics).toEqual({ totalDurationNs: 12_000_000, loadDurationNs: 3_000_000, evalCount: 8 })
    expect(JSON.stringify(calls[0])).not.toContain('受信しました')
  })

  it('reports the approved send budget as exhausted after one call', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport, adapterId, ['proposal', 'critic'])
    await grantApproval(relay, threadId, { maxSends: 1 })
    await relay.continueJob(threadId, adapterId)
    expect(transport.received).toHaveLength(1)

    const preflight = await relay.preflightExternalSend(threadId, adapterId, transport)
    expect(preflight.ok).toBe(false)
    expect(preflight.blockingReasons.join(' ')).toMatch(/send-budget-remaining: 1 of 1 approved sends already used/)
  })

  it('rejects preflight when a single-role Adapter cannot serve the Thread\'s next role', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    await relay.continueJob(threadId, adapterId)

    await expect(relay.preflightExternalSend(threadId, adapterId, transport)).rejects.toThrow(/registered for role\(s\) proposal, not critic/)
  })

  it('rejects an unsupported role before a multi-role Adapter reaches its hooks', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'must not send' })
    const adapter = new ExternalConversationAdapter('multi-role-probe', ['proposal', 'critic'], transport, {
      authorise: async () => { throw new Error('authorise must not run') },
      recordCall: async () => { throw new Error('recordCall must not run') },
      now: () => new Date()
    })
    const request: AdapterRequest = {
      dispatchId: 'dispatch-unsupported-role', taskId: 'task', threadId: 'thread', jobId: 'job', title: 'title',
      role: 'implementation', sequence: 0, priorTurns: []
    }

    await expect(adapter.send(request)).rejects.toThrow(/cannot take role implementation/)
    expect(transport.received).toHaveLength(0)
  })

  it.each([
    ['failed', 'failed'],
    ['invalid', 'invalid'],
    ['timeout', 'timeout'],
    ['cancelled', 'cancelled']
  ] as const)('records %s distinctly in the Result Envelope and Ledger', async (outcome, envelopeStatus) => {
    const transport = new MockExternalTransport({ status: outcome, content: outcome === 'failed' ? undefined : undefined })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    const thread = await relay.continueJob(threadId, adapterId)

    const turn = thread.turns[0]
    expect(turn.status).toBe(outcome === 'invalid' ? 'invalid' : 'failed')
    const envelope = JSON.parse(await readFile(path.join(relay.threadDirectory(threadId), 'results', `${turn.turnId}.json`), 'utf8'))
    expect(envelope.status).toBe(envelopeStatus)
    expect(envelope.verification).toEqual([{ name: 'external-answer-received', status: 'not-run', reason: expect.any(String) }])

    const calls = (await readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    expect(calls[0].status).toBe(outcome)
    expect(thread.state).toBe('failed')
  })

  it('records a transport failure without leaking the error detail into the Turn', async () => {
    const transport = new MockExternalTransport({ status: 'success', throws: 'ECONNREFUSED key=sk-ant-should-not-appear' })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)

    await expect(relay.continueJob(threadId, adapterId)).rejects.toThrow(/ECONNREFUSED/)
    const calls = (await readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
    expect(calls[0]).toMatchObject({ status: 'failed', terminationReason: 'transport-threw' })
    expect(calls[0].errorText.length).toBeLessThanOrEqual(200)
    expect((await relay.getConversationState(threadId)).turns).toHaveLength(0)
  })

  it('leaves an interrupted external send to the existing recovery path', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)
    await grantApproval(relay, threadId)
    await relay.sendToAdapter(threadId, adapterId)

    const restarted = new ConversationRelay({
      runtimeRoot: relay.runtimeRoot,
      adapters: [new ExternalConversationAdapter(adapterId, 'proposal', transport, relay.externalHooks(adapterId, transport)), new FakeCriticConversationAdapter()]
    })
    const detected = await restarted.scanForRecovery()
    expect(detected).toHaveLength(1)
    expect((await restarted.getConversationState(threadId)).recovery).toMatchObject({ reason: 'answer-unavailable', adapterId })
  })
})

describe('ADF-EXTERNAL-ADAPTER-001 owner cancel reaches the real request', () => {
  it('aborts the in-flight HTTP request and records it as cancelled, not timeout', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'
    try {
      let observed: AbortSignal | undefined
      // Stands in for the real API: never answers until the request is aborted.
      const transport = new AnthropicMessagesTransport({
        providerId: 'mock-provider',
        fetchImpl: (_input, init) =>
          new Promise((_resolve, reject) => {
            observed = init.signal as AbortSignal
            observed.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          })
      })

      const selectedAdapterId = 'claude-external'
      const { relay, threadId } = await relayWith(transport, selectedAdapterId)
      await grantApproval(relay, threadId, { provider: 'mock-provider' }, selectedAdapterId)
      const adapter = new ExternalConversationAdapter(selectedAdapterId, 'proposal', transport, relay.externalHooks(selectedAdapterId, transport))
      const rebound = new ConversationRelay({ runtimeRoot: relay.runtimeRoot, adapters: [adapter, new FakeCriticConversationAdapter()] })

      const pending = rebound.continueJob(threadId, selectedAdapterId)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(observed).toBeDefined()

      // The pending file is only written after the send returns, so the dispatchId comes from the
      // intent recorded before the send — the same record the Owner would see mid-flight.
      const events = (await readFile(path.join(rebound.threadDirectory(threadId), 'thread-events.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
      const intent = events.filter((event) => event.type === 'relay.dispatch-intent').at(-1)
      expect(adapter.cancel(intent.dispatchId)).toBe(true)
      const thread = await pending

      expect(thread.turns[0].status).toBe('failed')
      const envelope = JSON.parse(await readFile(path.join(rebound.threadDirectory(threadId), 'results', `${thread.turns[0].turnId}.json`), 'utf8'))
      expect(envelope.status).toBe('cancelled')
      expect(envelope.terminationReason).toBe('cancelled before the adapter answered')

      const calls = (await readFile(path.join(rebound.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
      expect(calls[0].status).toBe('cancelled')
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })

  it('reports nothing to cancel once the dispatch has completed', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay, threadId } = await relayWith(transport)
    const adapter = new ExternalConversationAdapter(adapterId, 'proposal', transport, relay.externalHooks(adapterId, transport))
    expect(adapter.cancel('never-dispatched')).toBe(false)
    expect(threadId).toBeTruthy()
  })
})

describe('ADF-EXTERNAL-ADAPTER-001 transport seam', () => {
  it('refuses to send when the provider transport is a placeholder', async () => {
    const transport = new UnconfiguredExternalTransport('claude', 'connection method awaiting Owner decision')
    await expect(transport.send()).rejects.toBeInstanceOf(TransportNotConfiguredError)
  })
})
