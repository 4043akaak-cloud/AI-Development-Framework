import path from 'node:path'
import { readdir } from 'node:fs/promises'
import type { AdapterRole, ApprovedTaskPacket, JobState } from '../../shared/jobLoopTypes'
import type { ConversationThread, ConversationTurn, OwnerAction, RelayDispatchHandle, RelayTurnPayload, ThreadSummary } from '../../shared/threadTypes'
import { getAdapterProfile } from './adapterRegistry'
import { canTransition, validateApprovedTask } from './contracts'
import type { AdapterAcceptance, ConversationAdapter } from './conversationAdapters'
import { FakeCriticConversationAdapter, FakeProposalConversationAdapter } from './conversationAdapters'
import { hashJson } from './hash'
import { appendEvent, ensureDir, readJson, removeFile, writeJsonAtomic, writeJsonExclusive } from './ledger'
import { validateResultEnvelope, type AdapterResultEnvelope } from './resultEnvelope'
import { JobRuntime } from './runtime'
import { appendTurn, applyOwnerDecision, createThread, defaultMaxTurns, lastTurn, summarize, ThreadRejectedError, turnHash, withState } from './thread'

export interface ConversationRelayOptions {
  runtimeRoot?: string
  clock?: () => Date
  adapters?: readonly ConversationAdapter[]
  jobRuntime?: JobRuntime
}

interface PendingDispatch {
  handle: RelayDispatchHandle
  handleHash: string
  acceptance: AdapterAcceptance
}

export class ConversationRelay {
  readonly runtimeRoot: string
  readonly clock: () => Date
  readonly jobRuntime: JobRuntime
  private readonly adapters: Map<string, ConversationAdapter>
  /** Serialises relay work per Thread so concurrent calls cannot claim the same sequence. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor({ runtimeRoot = '.adf-runtime', clock = () => new Date(), adapters, jobRuntime }: ConversationRelayOptions = {}) {
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.clock = clock
    this.jobRuntime = jobRuntime ?? new JobRuntime({ runtimeRoot: this.runtimeRoot, clock })
    const list = adapters ?? [new FakeProposalConversationAdapter(), new FakeCriticConversationAdapter()]
    this.adapters = new Map(list.map((adapter) => [adapter.adapterId, adapter]))
  }

  private serialise<T>(threadId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(threadId) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.queues.set(threadId, next.catch(() => undefined))
    return next
  }

  threadDirectory(threadId: string): string {
    return path.join(this.runtimeRoot, 'threads', threadId)
  }

  private threadPath(threadId: string): string {
    return path.join(this.threadDirectory(threadId), 'thread.json')
  }

  private pendingPath(threadId: string): string {
    return path.join(this.threadDirectory(threadId), 'pending-dispatch.json')
  }

  private now(): string {
    return this.clock().toISOString()
  }

  /** Local-only adapters are the MVP boundary; a `planned` external adapter is never dispatched. */
  private resolveAdapter(adapterId: string): ConversationAdapter {
    const profile = getAdapterProfile(adapterId)
    if (profile.status !== 'available') throw new ThreadRejectedError([`adapter is not available for dispatch: ${adapterId}`])
    if (profile.dataPolicy !== 'local-only') throw new ThreadRejectedError([`adapter is outside the local-only MVP boundary: ${adapterId}`])
    const adapter = this.adapters.get(adapterId)
    if (!adapter) throw new ThreadRejectedError([`adapter is not registered in this relay: ${adapterId}`])
    return adapter
  }

  private nextRole(thread: ConversationThread): AdapterRole {
    return thread.turns.length % 2 === 0 ? 'proposal' : 'critic'
  }

  private adapterForRole(role: AdapterRole): ConversationAdapter {
    for (const adapter of this.adapters.values()) if (adapter.role === role) return adapter
    throw new ThreadRejectedError([`no relay adapter registered for role ${role}`])
  }

  private async persist(thread: ConversationThread): Promise<ConversationThread> {
    await writeJsonAtomic(this.threadPath(thread.threadId), thread)
    return thread
  }

  private async record(threadId: string, type: string, details: Record<string, unknown>): Promise<void> {
    await appendEvent(path.join(this.threadDirectory(threadId), 'thread-events.jsonl'), { type, at: this.now(), threadId, ...details })
  }

  private async readPending(threadId: string): Promise<PendingDispatch | null> {
    try {
      return await readJson<PendingDispatch | null>(this.pendingPath(threadId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private async clearPending(threadId: string): Promise<void> {
    await removeFile(this.pendingPath(threadId))
  }

  private resultPath(threadId: string, turnId: string): string {
    return path.join(this.threadDirectory(threadId), 'results', `${turnId}.json`)
  }

  /**
   * Keeps the Job Ledger in step with the conversation. `awaiting-review` is terminal for a Job,
   * so the Job stays `running` while the Thread is mid-conversation and only settles once the
   * Thread reaches a terminal state.
   */
  private async syncJobState(thread: ConversationThread, to: JobState): Promise<void> {
    const job = await this.jobRuntime.readJob(thread.jobId)
    if (job.state === to) return
    if (!canTransition(job.state, to)) {
      await this.record(thread.threadId, 'job.state-skipped', { jobId: thread.jobId, from: job.state, to })
      return
    }
    await this.jobRuntime.transition(this.jobRuntime.jobDirectory(thread.jobId), job.state, to, { type: `job.${to}` })
    await this.record(thread.threadId, 'job.state', { jobId: thread.jobId, from: job.state, to })
  }

  private jobStateForThread(state: ConversationThread['state']): JobState | null {
    switch (state) {
      case 'stopped':
        return 'cancelled'
      case 'failed':
        return 'failed'
      case 'approved':
      case 'completed':
        return 'awaiting-review'
      default:
        return null
    }
  }

  /** Re-reads every referenced Result Envelope from disk before the Owner may adopt the Thread. */
  private async verifyStoredEvidence(thread: ConversationThread): Promise<void> {
    const adoptable = thread.turns.filter((turn) => turn.status === 'success' || turn.status === 'partial')
    if (adoptable.length === 0) throw new ThreadRejectedError(['approve requires at least one success or partial turn'])

    let verified = 0
    for (const turn of adoptable) {
      if (!turn.resultEnvelopeRef || !turn.resultEnvelopeHash) throw new ThreadRejectedError([`turn ${turn.turnId} has no stored result envelope`])
      let envelope: AdapterResultEnvelope
      try {
        envelope = await readJson<AdapterResultEnvelope>(this.resultPath(thread.threadId, turn.turnId))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ThreadRejectedError([`result envelope file is missing for turn ${turn.turnId}`])
        throw error
      }
      if (hashJson(envelope) !== turn.resultEnvelopeHash) throw new ThreadRejectedError([`result envelope for turn ${turn.turnId} was modified after it was recorded`])
      validateResultEnvelope(envelope, { taskId: thread.taskId, jobId: thread.jobId, inputHash: thread.inputHash })
      if (envelope.status !== turn.status) throw new ThreadRejectedError([`result envelope status does not match turn ${turn.turnId}`])
      if (envelope.verification.some((item) => item.status === 'pass')) verified += 1
    }
    if (verified === 0) throw new ThreadRejectedError(['approve requires at least one result envelope with a passing verification'])
  }

  /**
   * A Thread only exists for an Owner-approved Task that passed the existing delivery gate:
   * `validateApprovedTask → Dispatch Packet → Dispatch ACK → Job registration`. The Thread binds
   * to that registered Job rather than inventing a job id of its own.
   */
  async startThread(packet: ApprovedTaskPacket, options: { title?: string; maxTurns?: number } = {}): Promise<ConversationThread> {
    validateApprovedTask(packet, this.clock())
    const registration = await this.jobRuntime.registerApprovedJob(packet)
    const job = await this.jobRuntime.readJob(registration.jobId)
    if (job.dispatchState !== 'preflight-valid') {
      throw new ThreadRejectedError([`job dispatch is not preflight-valid: ${job.dispatchState}`])
    }

    const id = `thread-${hashJson([packet.taskId, packet.approval.approvalId, registration.jobId]).slice(0, 16)}`
    await ensureDir(this.threadDirectory(id))
    const existing = await this.tryRead(id)
    if (existing) return existing

    const thread = createThread({
      threadId: id,
      taskId: packet.taskId,
      jobId: registration.jobId,
      title: options.title ?? packet.objective,
      approvalId: packet.approval.approvalId,
      scopeHash: packet.scopeHash,
      contextHash: packet.contextHash,
      routingPlanHash: packet.approval.routingPlanHash,
      inputHash: registration.inputHash,
      createdAt: this.now(),
      maxTurns: options.maxTurns ?? defaultMaxTurns
    })
    await this.record(id, 'thread.created', { taskId: packet.taskId, jobId: registration.jobId, approvalId: packet.approval.approvalId, packetHash: job.packetHash, maxTurns: thread.maxTurns })
    return this.persist(thread)
  }

  /** `send_to_adapter`: hand the approved Thread context to the Adapter and claim the pending dispatch. */
  sendToAdapter(threadId: string, adapterId?: string): Promise<RelayDispatchHandle> {
    return this.serialise(threadId, () => this.sendToAdapterUnsafe(threadId, adapterId))
  }

  private async sendToAdapterUnsafe(threadId: string, adapterId?: string): Promise<RelayDispatchHandle> {
    const thread = await this.getConversationState(threadId)
    if (thread.state !== 'open') throw new ThreadRejectedError([`thread is not open: ${thread.state}`])
    if (thread.turns.length >= thread.maxTurns) throw new ThreadRejectedError([`max turns exceeded: ${thread.maxTurns}`])

    const pending = await this.readPending(threadId)
    if (pending) throw new ThreadRejectedError([`a dispatch is already pending for turn ${pending.handle.sequence}`])

    const expectedRole = this.nextRole(thread)
    const adapter = adapterId ? this.resolveAdapter(adapterId) : this.adapterForRole(expectedRole)
    if (adapter.role !== expectedRole) throw new ThreadRejectedError([`turn ${thread.turns.length} requires role ${expectedRole}, but ${adapter.adapterId} is ${adapter.role}`])

    const parent = lastTurn(thread)
    const sequence = thread.turns.length
    const handle: RelayDispatchHandle = {
      dispatchId: `relay-dispatch-${hashJson([threadId, sequence, adapter.adapterId]).slice(0, 20)}`,
      threadId,
      taskId: thread.taskId,
      jobId: thread.jobId,
      adapterId: adapter.adapterId,
      role: adapter.role,
      sequence,
      ...(parent ? { respondsToTurnId: parent.turnId, respondsToHash: turnHash(parent) } : {}),
      sentAt: this.now()
    }

    const acceptance = await adapter.send({
      dispatchId: handle.dispatchId,
      taskId: thread.taskId,
      threadId,
      jobId: thread.jobId,
      title: thread.title,
      role: adapter.role,
      sequence,
      priorTurns: thread.turns
    })
    if (acceptance.dispatchId !== handle.dispatchId || acceptance.adapterId !== adapter.adapterId) {
      throw new ThreadRejectedError(['adapter acceptance does not match the dispatch'])
    }

    try {
      await writeJsonExclusive(this.pendingPath(threadId), { handle, handleHash: hashJson(handle), acceptance } satisfies PendingDispatch)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ThreadRejectedError(['a dispatch is already pending for this thread'])
      throw error
    }
    await this.record(threadId, 'relay.sent', { dispatchId: handle.dispatchId, adapterId: handle.adapterId, sequence, adapterConversationId: acceptance.adapterConversationId })
    await this.syncJobState(thread, 'running')
    return handle
  }

  /**
   * `receive_from_adapter`: accept the Adapter answer as a Turn. The stored pending dispatch is the
   * only source of truth, so a caller cannot substitute a different job, adapter, role or sequence.
   */
  receiveFromAdapter(handle: RelayDispatchHandle, payload?: RelayTurnPayload): Promise<ConversationThread> {
    return this.serialise(handle.threadId, () => this.receiveFromAdapterUnsafe(handle, payload))
  }

  private async receiveFromAdapterUnsafe(handle: RelayDispatchHandle, payload?: RelayTurnPayload): Promise<ConversationThread> {
    const thread = await this.getConversationState(handle.threadId)
    const pending = await this.readPending(handle.threadId)
    if (!pending) throw new ThreadRejectedError(['no pending dispatch for this thread'])
    if (hashJson(handle) !== pending.handleHash) throw new ThreadRejectedError(['handle does not match the stored pending dispatch'])

    const stored = pending.handle
    const adapter = this.resolveAdapter(stored.adapterId)
    const answer = payload ?? (await adapter.receive(pending.acceptance))

    const turnId = `turn-${stored.sequence}-${hashJson([stored.dispatchId, answer.content]).slice(0, 12)}`
    const createdAt = this.now()
    const envelope = this.buildResultEnvelope(thread, stored, answer, turnId, createdAt)
    validateResultEnvelope(envelope, { taskId: thread.taskId, jobId: thread.jobId, inputHash: thread.inputHash })
    if (answer.status === 'success' && !envelope.verification.some((item) => item.status === 'pass')) {
      throw new ThreadRejectedError(['a success turn requires at least one passing verification entry'])
    }

    const turn: ConversationTurn = {
      turnId,
      threadId: stored.threadId,
      jobId: stored.jobId,
      dispatchId: stored.dispatchId,
      sequence: stored.sequence,
      adapterId: stored.adapterId,
      role: stored.role,
      ...(stored.respondsToTurnId ? { respondsToTurnId: stored.respondsToTurnId, respondsToHash: stored.respondsToHash } : {}),
      content: answer.content,
      status: answer.status,
      resultEnvelopeRef: `threads/${stored.threadId}/results/${turnId}.json`,
      resultEnvelopeHash: hashJson(envelope),
      ...(answer.errorRef ? { errorRef: answer.errorRef } : {}),
      createdAt
    }

    const appended = appendTurn(thread, turn)
    await writeJsonAtomic(this.resultPath(stored.threadId, turnId), envelope)
    await this.writeEvidenceLinks(appended)
    await this.clearPending(stored.threadId)
    await this.record(stored.threadId, 'relay.received', { dispatchId: stored.dispatchId, turnId, status: turn.status, turnHash: turnHash(turn), resultHash: hashJson(envelope) })

    const failed = answer.status === 'failed' || answer.status === 'invalid'
    const reachedLimit = appended.turns.length >= appended.maxTurns
    const next = failed
      ? withState(appended, 'failed', turn.createdAt, `adapter returned ${answer.status}`)
      : withState(appended, 'awaiting-owner', turn.createdAt, reachedLimit ? `max turns reached: ${appended.maxTurns}` : undefined)
    await this.record(stored.threadId, 'thread.state', { state: next.state, ...(next.stopReason ? { stopReason: next.stopReason } : {}) })
    const jobState = this.jobStateForThread(next.state)
    if (jobState) await this.syncJobState(next, jobState)
    return this.persist(next)
  }

  /** ADF owns the identity and hash fields, so an Adapter cannot claim another Task, Job or input. */
  private buildResultEnvelope(thread: ConversationThread, stored: RelayDispatchHandle, answer: RelayTurnPayload, turnId: string, createdAt: string): AdapterResultEnvelope {
    return {
      resultId: turnId,
      jobId: thread.jobId,
      taskId: thread.taskId,
      adapterId: stored.adapterId,
      role: stored.role,
      inputHash: thread.inputHash,
      scopeHash: thread.scopeHash,
      contextHash: thread.contextHash,
      status: answer.status,
      summary: answer.summary ?? answer.content.slice(0, 200),
      artifact: { turnId, threadId: thread.threadId, sequence: stored.sequence, respondsToTurnId: stored.respondsToTurnId ?? null },
      verification: answer.verification ?? [],
      risks: answer.risks ?? [],
      ownerDecisionRequired: true,
      nextOwnerDecision: answer.status === 'success' || answer.status === 'partial' ? 'このTurnを確認し、継続・停止・承認を判断する' : 'Turnの失敗理由を確認し、停止または再設計を判断する',
      createdAt,
      durationMs: 0,
      terminationReason: answer.status === 'success' ? 'completed' : `adapter-${answer.status}`
    }
  }

  private async writeEvidenceLinks(thread: ConversationThread): Promise<void> {
    await writeJsonAtomic(path.join(this.threadDirectory(thread.threadId), 'evidence-links.json'), {
      threadId: thread.threadId,
      taskId: thread.taskId,
      jobId: thread.jobId,
      approvalId: thread.approvalId,
      jobLedger: `jobs/${thread.jobId}/`,
      turns: thread.turns.map((turn) => ({ turnId: turn.turnId, adapterId: turn.adapterId, role: turn.role, status: turn.status, resultEnvelopeRef: turn.resultEnvelopeRef ?? null }))
    })
  }

  /**
   * `continue_job`: add the next Turn to the same Thread. The Adapter is polled through its own
   * `getState`, so an external Adapter that answers later plugs in without changing this flow.
   */
  continueJob(threadId: string, adapterId?: string): Promise<ConversationThread> {
    return this.serialise(threadId, () => this.continueJobUnsafe(threadId, adapterId))
  }

  private async continueJobUnsafe(threadId: string, adapterId?: string): Promise<ConversationThread> {
    const thread = await this.getConversationState(threadId)
    if (thread.turns.length >= thread.maxTurns) {
      const stopped = withState(thread, 'failed', this.now(), `max turns reached: ${thread.maxTurns}`)
      await this.record(threadId, 'thread.state', { state: stopped.state, stopReason: stopped.stopReason })
      await this.syncJobState(stopped, 'failed')
      return this.persist(stopped)
    }

    const handle = await this.sendToAdapterUnsafe(threadId, adapterId)
    const pending = await this.readPending(threadId)
    if (!pending) throw new ThreadRejectedError(['pending dispatch disappeared before receive'])
    const adapter = this.resolveAdapter(handle.adapterId)
    const state = await adapter.getState(pending.acceptance)
    if (state !== 'ready') {
      await this.record(threadId, 'relay.awaiting-adapter', { dispatchId: handle.dispatchId, adapterState: state })
      throw new ThreadRejectedError([`adapter has not produced an answer yet: ${state}`])
    }
    return this.receiveFromAdapterUnsafe(handle)
  }

  /** `get_conversation_state`: the Thread as ADF holds it. */
  async getConversationState(threadId: string): Promise<ConversationThread> {
    const thread = await this.tryRead(threadId)
    if (!thread) throw new ThreadRejectedError([`thread not found: ${threadId}`])
    return thread
  }

  private async tryRead(threadId: string): Promise<ConversationThread | null> {
    try {
      return await readJson<ConversationThread>(this.threadPath(threadId))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  recordOwnerDecision(threadId: string, action: OwnerAction, note?: string): Promise<ConversationThread> {
    return this.serialise(threadId, () => this.recordOwnerDecisionUnsafe(threadId, action, note))
  }

  private async recordOwnerDecisionUnsafe(threadId: string, action: OwnerAction, note?: string): Promise<ConversationThread> {
    const thread = await this.getConversationState(threadId)
    if (action === 'approve') await this.verifyStoredEvidence(thread)
    const decided = applyOwnerDecision(thread, action, this.now(), note)
    await this.record(threadId, 'owner.decision', { action, state: decided.state, ...(note ? { note } : {}) })
    const jobState = this.jobStateForThread(decided.state)
    if (jobState) await this.syncJobState(decided, jobState)
    return this.persist(decided)
  }

  /**
   * One Owner action: record the `continue` decision and add the next Turn inside a single
   * serialised step, so no other Owner action can interleave between the two.
   */
  continueWithOwnerApproval(threadId: string, note?: string): Promise<ConversationThread> {
    return this.serialise(threadId, async () => {
      const decided = await this.recordOwnerDecisionUnsafe(threadId, 'continue', note)
      if (decided.state !== 'open') return decided
      return this.continueJobUnsafe(threadId)
    })
  }

  async listThreads(): Promise<ThreadSummary[]> {
    let entries: string[]
    try {
      entries = (await readdir(path.join(this.runtimeRoot, 'threads'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const summaries: ThreadSummary[] = []
    for (const threadId of entries) {
      const thread = await this.tryRead(threadId)
      if (thread) summaries.push(summarize(thread))
    }
    return summaries
  }
}
