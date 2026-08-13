import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ApprovedTaskPacket } from '../src/shared/jobLoopTypes'
import type { ExternalSendApproval } from '../src/shared/externalAdapterTypes'
import { routeAdapters } from '../src/main/jobLoop/adapterRegistry'
import { hashJson } from '../src/main/jobLoop/hash'
import { writeJsonAtomic } from '../src/main/jobLoop/ledger'
import { ConversationRelay } from '../src/main/jobLoop/relay'
import { ExternalConversationAdapter } from '../src/main/jobLoop/externalAdapter'
import { externalApprovalPath } from '../src/main/jobLoop/externalApproval'
import { MockExternalTransport } from '../src/main/jobLoop/externalTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'
import { AnthropicMessagesTransport } from '../src/main/jobLoop/anthropicTransport'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from '../src/main/jobLoop/conversationAdapters'
import {
  approvedTaskDirectory,
  cancelExternal,
  continueThread,
  decideThread,
  externalSendState,
  preflightExternal,
  scanForRecovery,
  sendExternal,
  sendFirstTurn,
  startApprovedThread
} from '../src/main/relayService'

const taskId = 'ADF-EXTERNAL-ADAPTER-001'
const externalAdapterId = 'external-probe-mock'

function approvedPacket(): ApprovedTaskPacket {
  const scope = { inScope: ['外部Adapter接続'], outOfScope: ['repo送信', '正本変更'] }
  const context = { githubTask: `manual-fixture://${taskId}`, obsidianContext: [], adoptedPrinciples: ['owner-approval'] }
  const scopeHash = hashJson(scope)
  const adapterPlan = routeAdapters(taskId, ['proposal', 'critic'], ['read', 'propose'])
  return {
    taskId,
    objective: 'ElectronからExternal Adapterを操作する',
    scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: ['Owner操作なしに外部送信が起きない'],
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

/**
 * Rebuilds exactly what `src/main/index.ts` assembles at `app.whenReady()`: one Relay holding the
 * Fake adapters plus the external Adapter, with the transport registered so the IPC layer can
 * resolve it by adapterId. Nothing here opens a connection.
 */
async function wiredMain(transport: MockExternalTransport | AnthropicMessagesTransport, runtimeRoot?: string, adapterId = externalAdapterId) {
  const root = runtimeRoot ?? (await mkdtemp(path.join(tmpdir(), 'adf-ipc-')))
  let relay: ConversationRelay
  relay = new ConversationRelay({
    runtimeRoot: root,
    externalTransports: { [adapterId]: transport },
    adapters: [
      new FakeProposalConversationAdapter(),
      new FakeCriticConversationAdapter(),
      new ExternalConversationAdapter(adapterId, 'proposal', transport, {
        authorise: (request) => relay.externalHooks(adapterId, transport).authorise(request),
        recordCall: (record) => relay.externalHooks(adapterId, transport).recordCall(record),
        now: () => new Date()
      })
    ]
  })
  return { relay, runtimeRoot: root }
}

/** Places an Owner-approved Task Packet the way the Owner does — on disk, outside the renderer. */
async function placeApprovedTask(relay: ConversationRelay): Promise<string> {
  await writeJsonAtomic(path.join(approvedTaskDirectory(relay), `${taskId}.json`), approvedPacket())
  const started = await startApprovedThread(relay, taskId)
  if (!started.ok) throw new Error(started.error)
  return started.value.threadId
}

async function grantApproval(relay: ConversationRelay, threadId: string, overrides: Partial<ExternalSendApproval> = {}, adapterId = externalAdapterId): Promise<ExternalSendApproval> {
  const thread = await relay.getConversationState(threadId)
  const packet = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
  const approval: ExternalSendApproval = {
    approvalId: 'external-send-approval-ipc',
    taskId: thread.taskId,
    threadId,
    adapterId,
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

describe('ADF-EXTERNAL-ADAPTER-001 Electron wiring', () => {
  it('sends nothing externally while the app starts up and scans for recovery', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    await grantApproval(relay, threadId)

    // Exactly what index.ts runs before the window exists.
    const scanned = await scanForRecovery(relay)

    expect(scanned.ok).toBe(true)
    expect(transport.received).toHaveLength(0)
    expect((await relay.getConversationState(threadId)).turns).toHaveLength(0)
  })

  it('returns the preflight report over IPC without opening a connection', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    await grantApproval(relay, threadId)

    const result = await preflightExternal(relay, threadId, externalAdapterId)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.ok).toBe(true)
    expect(result.value.role).toBe('proposal')
    expect(result.value.costTier).toBe('free')
    expect(result.value.sendsRemaining).toBe(1)
    expect(result.value.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(transport.received).toHaveLength(0)
  })

  it('never labels a passing check with the sentence that describes it failing', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    await grantApproval(relay, threadId)

    const result = await preflightExternal(relay, threadId, externalAdapterId)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const passed = result.value.checks.filter((check) => check.status === 'pass')
    expect(passed).toHaveLength(result.value.checks.length)
    for (const check of passed) {
      expect(check.detail, `${check.name} reads as a failure while passing`).not.toMatch(/does not|different|not match|no execution approval/)
    }
  })

  it('blocks the send before it starts when the credential is unset, and calls fetch zero times', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      let fetchCalls = 0
      const transport = new AnthropicMessagesTransport({
        fetchImpl: async () => {
          fetchCalls += 1
          throw new Error('the send must be stopped by preflight, before any request')
        }
      })
      const { relay } = await wiredMain(transport)
      const threadId = await placeApprovedTask(relay)
      // Everything else the Owner controls is in place: only the credential is missing.
      await grantApproval(relay, threadId, { provider: 'anthropic-messages-api' })

      const preflight = await preflightExternal(relay, threadId, externalAdapterId)
      expect(preflight.ok).toBe(true)
      if (!preflight.ok) return
      expect(preflight.value.ok).toBe(false)
      expect(preflight.value.credential).toEqual({ required: true, present: false, source: 'environment variable ANTHROPIC_API_KEY', authMode: 'environment-secret' })
      expect(preflight.value.blockingReasons.join(' ')).toMatch(/credential-present: no credential is set at environment variable ANTHROPIC_API_KEY/)
      expect(preflight.value.checks.find((check) => check.name === 'credential-present')?.status).toBe('fail')

      const sent = await sendExternal(relay, threadId, externalAdapterId)
      expect(sent.ok).toBe(false)
      expect(fetchCalls).toBe(0)
      // Nothing reached the Thread or the Ledger, so there is no half-started send to recover.
      expect((await relay.getConversationState(threadId)).turns).toHaveLength(0)
      await expect(readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })

  it('reports the credential as present without ever carrying its value', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    const secret = 'sk-ant-do-not-surface-this-value'
    process.env.ANTHROPIC_API_KEY = secret
    try {
      const transport = new AnthropicMessagesTransport({ fetchImpl: async () => { throw new Error('not reached') } })
      const { relay } = await wiredMain(transport, undefined, 'claude-external')
      const threadId = await placeApprovedTask(relay)
      await grantApproval(relay, threadId, { provider: 'anthropic-messages-api' }, 'claude-external')

      const preflight = await preflightExternal(relay, threadId, 'claude-external')
      expect(preflight.ok).toBe(true)
      if (!preflight.ok) return
      expect(preflight.value.ok).toBe(true)
      expect(preflight.value.credential).toEqual({ required: true, present: true, source: 'environment variable ANTHROPIC_API_KEY', authMode: 'environment-secret' })
      // The whole report crosses the IPC boundary, so the value must not be anywhere in it.
      expect(JSON.stringify(preflight.value)).not.toContain(secret)
      expect(JSON.stringify(preflight.value)).not.toMatch(/sk-ant/)
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })

  it('refuses the IPC send and reports the reason when no execution approval exists', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)

    const preflight = await preflightExternal(relay, threadId, externalAdapterId)
    expect(preflight.ok && preflight.value.ok).toBe(false)

    const sent = await sendExternal(relay, threadId, externalAdapterId)
    expect(sent.ok).toBe(false)
    if (sent.ok) return
    expect(sent.error).toMatch(/external send blocked: .*owner-approval-present/)
    expect(transport.received).toHaveLength(0)
  })

  it.each([
    ['packet', { packetHash: 'a-different-packet' }, /approval-matches-packet/],
    ['scope', { scopeHash: 'a-different-scope' }, /approval-matches-scope/],
    ['context', { contextHash: 'a-different-context' }, /approval-matches-context/],
    ['role', { role: 'critic' }, /approval-matches-role/]
  ] as Array<[string, Partial<ExternalSendApproval>, RegExp]>)('sends nothing over IPC when the approved %s does not match', async (_label, override, expected) => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    await grantApproval(relay, threadId, override)

    const preflight = await preflightExternal(relay, threadId, externalAdapterId)
    expect(preflight.ok && preflight.value.ok).toBe(false)
    if (preflight.ok) expect(preflight.value.blockingReasons.join(' ')).toMatch(expected)

    const sent = await sendExternal(relay, threadId, externalAdapterId)
    expect(sent.ok).toBe(false)
    expect(transport.received).toHaveLength(0)
  })

  it('carries one approved send through to a Result the Owner can review and approve', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: '受信しました。役割: proposal。' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    const approval = await grantApproval(relay, threadId)

    const sent = await sendExternal(relay, threadId, externalAdapterId)
    expect(sent.ok).toBe(true)
    if (!sent.ok) return

    expect(transport.received).toHaveLength(1)
    expect(transport.received[0].packetHash).toBe(approval.packetHash)
    expect(sent.value.state).toBe('awaiting-owner')
    expect(sent.value.turns[0].adapterId).toBe(externalAdapterId)

    const decided = await decideThread(relay, threadId, 'approve', 'Ownerが外部回答を採用')
    expect(decided.ok).toBe(true)
    if (decided.ok) expect(decided.value.state).toBe('approved')

    // The budget is spent, so the UI's next preflight disables the button again.
    const next = await preflightExternal(relay, threadId, externalAdapterId)
    expect(next.ok && next.value.ok).toBe(false)
  })

  it('reports no in-flight send, and nothing to cancel, while the Thread is idle', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)

    const state = await externalSendState(relay, threadId)
    expect(state.ok && state.value.inFlight).toBe(false)

    const cancelled = await cancelExternal(relay, threadId, null)
    expect(cancelled.ok && cancelled.value.cancelled).toBe(false)
  })

  it('cancels an in-flight send by threadId and reaches the real AbortSignal', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'
    try {
      let observed: AbortSignal | undefined
      // Never answers, so the only way the request ends is the Owner's cancel.
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

      const { relay } = await wiredMain(transport, undefined, 'claude-external')
      const threadId = await placeApprovedTask(relay)
      await grantApproval(relay, threadId, { provider: 'mock-provider' }, 'claude-external')

      const pending = sendExternal(relay, threadId, 'claude-external')
      await new Promise((resolve) => setTimeout(resolve, 20))

      const midFlight = await externalSendState(relay, threadId)
      expect(midFlight.ok && midFlight.value.inFlight).toBe(true)
      expect(observed?.aborted).toBe(false)

      const cancelled = await cancelExternal(relay, threadId, 'Ownerが中断')
      expect(cancelled.ok && cancelled.value.cancelled).toBe(true)
      expect(observed?.aborted).toBe(true)

      const sent = await pending
      expect(sent.ok).toBe(true)
      if (!sent.ok) return

      const turn = sent.value.turns[0]
      const envelope = JSON.parse(await readFile(path.join(relay.threadDirectory(threadId), 'results', `${turn.turnId}.json`), 'utf8'))
      expect(envelope.status).toBe('cancelled')
      const calls = (await readFile(path.join(relay.threadDirectory(threadId), 'external-calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
      expect(calls[0].status).toBe('cancelled')

      const settled = await externalSendState(relay, threadId)
      expect(settled.ok && settled.value.inFlight).toBe(false)
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })

  it('never opens a request for a dispatch cancelled before the transport ran', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'
    try {
      let fetchCalls = 0
      const transport = new AnthropicMessagesTransport({
        providerId: 'mock-provider',
        fetchImpl: async () => {
          fetchCalls += 1
          throw new Error('the transport must not reach fetch for an aborted dispatch')
        }
      })
      const controller = new AbortController()
      controller.abort()

      const packet = buildSyntheticPacket({ taskId, threadId: 'thread-cancelled', jobId: 'job-cancelled', scopeHash: 's', contextHash: 'c', turns: [] } as never, 'proposal', 0, '2026-08-10T00:00:00.000Z')
      const outcome = await transport.send(packet, { timeoutMs: 30_000, signal: controller.signal })

      expect(outcome.status).toBe('cancelled')
      expect(fetchCalls).toBe(0)
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })

  it('leaves the Fake Adapter Thread working exactly as before', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)

    const first = await sendFirstTurn(relay, threadId)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.turns[0].adapterId).toBe('fake-ai-a')
    expect(first.value.state).toBe('awaiting-owner')

    const second = await continueThread(relay, threadId, 'Criticの反論を求める')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.turns[1].adapterId).toBe('fake-ai-b')

    expect(transport.received).toHaveLength(0)
  })

  it('exposes no channel that writes an execution approval', async () => {
    const preloadSource = await readFile(path.join(__dirname, '..', 'src', 'preload', 'index.ts'), 'utf8')
    const rendererSource = await readFile(path.join(__dirname, '..', 'src', 'renderer', 'src', 'ThreadPanel.tsx'), 'utf8')

    for (const source of [preloadSource, rendererSource]) {
      expect(source).not.toMatch(/writeFile|writeJson|approve-external|grant-approval|external-approval/i)
    }
    // Every renderer-reachable external channel is read-only or an explicit one-shot Owner action.
    const channels = [...preloadSource.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1])
    expect(channels.filter((channel) => channel.startsWith('relay:'))).toEqual([
      'relay:approved-tasks',
      'relay:list',
      'relay:get',
      'relay:start',
      'relay:send-first',
      'relay:continue',
      'relay:decide',
      'relay:recover',
      'relay:preflight-external',
      'relay:send-external',
      'relay:cancel-external',
      'relay:external-state'
    ])
  })

  it('rejects a malformed threadId or adapterId before touching the Thread', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    await placeApprovedTask(relay)

    for (const bad of ['../escape', '', 'a'.repeat(200), 'has space']) {
      expect((await preflightExternal(relay, bad, externalAdapterId)).ok).toBe(false)
      expect((await sendExternal(relay, 'thread-x', bad)).ok).toBe(false)
    }
    expect(transport.received).toHaveLength(0)
  })

  it('keeps a hand-edited approval file from authorising a send', async () => {
    const transport = new MockExternalTransport({ status: 'success', content: 'ok' })
    const { relay } = await wiredMain(transport)
    const threadId = await placeApprovedTask(relay)
    await grantApproval(relay, threadId)
    // Corrupt the file the way a truncated write or a hand edit would.
    await writeFile(externalApprovalPath(relay.runtimeRoot, threadId), '{ "approvalId": ', 'utf8')

    const preflight = await preflightExternal(relay, threadId, externalAdapterId)
    expect(preflight.ok).toBe(false)
    expect((await sendExternal(relay, threadId, externalAdapterId)).ok).toBe(false)
    expect(transport.received).toHaveLength(0)
  })
})
