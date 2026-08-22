import path from 'node:path'
import { readdir } from 'node:fs/promises'
import type { AdapterProfile, AdapterRole, ApprovedTaskPacket, JobEvent, JobState } from '../../shared/jobLoopTypes'
import type { ConversationThread, ConversationTurn, OwnerAction, RecoveryInfo, RelayDispatchHandle, RelayTurnPayload, ThreadSummary } from '../../shared/threadTypes'
import { checkAdapterPlanMembership, getAdapterProfile } from './adapterRegistry'
import { canTransition, validateApprovedTask } from './contracts'
import type { AdapterAcceptance, AdapterDependencyResult, ConversationAdapter } from './conversationAdapters'
import { adapterSupportsRole, FakeCriticConversationAdapter, FakeProposalConversationAdapter } from './conversationAdapters'
import { hashJson } from './hash'
import { appendEvent, ensureDir, readEvents, readJson, removeFile, writeJsonAtomic, writeJsonExclusive } from './ledger'
import type { ExternalPreflight } from '../../shared/externalAdapterTypes'
import { assertExternalSendAllowed, preflightExternalSend, readExternalApproval } from './externalApproval'
import type { ExternalAdapterHooks } from './externalAdapter'
import type { ExternalTransport } from './externalTransport'
import { assertPacketBoundary, buildSyntheticPacket } from './syntheticPacket'
import { validateResultEnvelope, type AdapterResultEnvelope } from './resultEnvelope'
import { JobRuntime } from './runtime'
import { appendRecoveryTurn, appendTurn, applyOwnerDecision, createThread, defaultMaxTurns, enterRecovery, lastTurn, leaveRecovery, summarize, ThreadRejectedError, turnHash, withState } from './thread'

/** Display-only deadline for a pending dispatch. Passing it never triggers an automatic action. */
export const defaultPendingTtlMs = 15 * 60 * 1000

/** Keeps adapter-supplied error text short and free of stack traces or payloads. */
function safeErrorText(error: unknown): string {
  return String((error as Error)?.message ?? error).slice(0, 200)
}

export interface ConversationRelayOptions {
  runtimeRoot?: string
  clock?: () => Date
  adapters?: readonly ConversationAdapter[]
  jobRuntime?: JobRuntime
  pendingTtlMs?: number
  /** Provider transports, keyed by adapterId, so the Owner gate can run without the renderer. */
  externalTransports?: Readonly<Record<string, ExternalTransport>>
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
  readonly pendingTtlMs: number
  private readonly adapters: Map<string, ConversationAdapter>
  private readonly externalTransports: Map<string, ExternalTransport>
  /** Which dispatch is currently open per Thread, so an Owner cancel needs only a threadId. */
  private readonly inFlight = new Map<string, { dispatchId: string; adapterId: string }>()
  /** Serialises relay work per Thread so concurrent calls cannot claim the same sequence. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor({ runtimeRoot = '.adf-runtime', clock = () => new Date(), adapters, jobRuntime, pendingTtlMs = defaultPendingTtlMs, externalTransports = {} }: ConversationRelayOptions = {}) {
    this.externalTransports = new Map(Object.entries(externalTransports))
    this.runtimeRoot = path.resolve(runtimeRoot)
    this.clock = clock
    this.pendingTtlMs = pendingTtlMs
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

  /**
   * `local-only` adapters dispatch freely. An `external-send` adapter is allowed here only so its
   * own Owner gate can run inside `send`; a `planned` adapter is never dispatched at all.
   */
  private resolveAdapter(adapterId: string): ConversationAdapter {
    const profile = getAdapterProfile(adapterId)
    if (profile.status !== 'available') throw new ThreadRejectedError([`adapter is not available for dispatch: ${adapterId}`])
    if (profile.dataPolicy !== 'local-only' && profile.dataPolicy !== 'external-send') {
      throw new ThreadRejectedError([`adapter has an undeclared data policy: ${adapterId}`])
    }
    const adapter = this.adapters.get(adapterId)
    if (!adapter) throw new ThreadRejectedError([`adapter is not registered in this relay: ${adapterId}`])
    return adapter
  }

  /** Frontdoor Prepare uses this to reject a Registry-only Adapter that this Relay cannot execute. */
  assertAdapterRegistered(adapterId: string, role: AdapterRole): void {
    const adapter = this.resolveAdapter(adapterId)
    if (!adapterSupportsRole(adapter, role)) throw new ThreadRejectedError([`adapter ${adapterId} is registered for role(s) ${(adapter.supportedRoles ?? [adapter.role]).join(', ')}, not ${role}`])
  }

  /**
   * Re-checks live transport readiness only at an explicit dispatch boundary. A failed check is
   * thrown before Frontdoor creates a child Job/Thread, and before the direct external-send path
   * can invoke the transport. Non-local-http transports keep their existing approval contract.
   */
  async assertAdapterReadyForDispatch(adapterId: string): Promise<void> {
    const profile = getAdapterProfile(adapterId)
    if (profile.connection !== 'local-http') return
    this.resolveAdapter(adapterId)
    const transport = this.requireTransport(adapterId)
    if (transport.connection !== profile.connection) throw new ThreadRejectedError([`profile and transport connection mismatch for ${adapterId}`])
    if (!transport.isLocalEndpoint?.()) throw new ThreadRejectedError([`local-http adapter target is not confirmed as loopback: ${adapterId}`])
    if (!transport.checkReadiness) throw new ThreadRejectedError([`local-http adapter has no readiness check: ${adapterId}`])
    const readiness = await transport.checkReadiness()
    if (!readiness.ready) throw new ThreadRejectedError([`adapter readiness failed for ${adapterId}: ${readiness.detail}`])
  }

  /**
   * A local-only adapter named explicitly (not auto-routed) must be one of the Thread's own approved
   * `adapterPlan` selections — the Plan the Owner actually approved via `routingPlanHash`. This closes
   * the gap where an explicit adapterId could reach a `local-only` adapter that was never part of what
   * was approved (e.g. a Task Packet approving `fake-ai-a` while the caller names `ollama-local`).
   * An `external-send` adapter is untouched here: its gate is the separate Owner-approval-file check
   * in `preflightExternalSend`, and `AdapterPlan` can never contain an external-send selection at all
   * (see `validateAdapterPlan`), so this check would reject it for the wrong reason if it ran there too.
   */
  private assertExplicitDispatchIsApprovedPlan(thread: ConversationThread, adapterId: string, role: AdapterRole): void {
    const profile = getAdapterProfile(adapterId)
    if (profile.dataPolicy !== 'local-only') return
    const membership = checkAdapterPlanMembership(thread.adapterPlan, thread.routingPlanHash, adapterId, role)
    if (!membership.ok) {
      throw new ThreadRejectedError([`explicit adapterId is not part of this Thread's approved adapterPlan: ${adapterId} (role ${role}) — ${membership.detail}`])
    }
  }

  private nextRole(thread: ConversationThread): AdapterRole {
    if (thread.turns.length === 0) return thread.adapterPlan.selections[0]?.role ?? 'proposal'
    return thread.turns.length % 2 === 0 ? 'proposal' : 'critic'
  }

  /** Automatic role routing never reaches outside this machine: an external Adapter must be named. */
  private adapterForRole(role: AdapterRole): ConversationAdapter {
    for (const adapter of this.adapters.values()) {
      if (!adapterSupportsRole(adapter, role)) continue
      const profile = getAdapterProfile(adapter.adapterId)
      if (profile.status !== 'available') continue
      if (profile.dataPolicy !== 'local-only') continue
      if (profile.connection === 'local-http') continue
      if (profile.autoSelectable === false) continue
      return adapter
    }
    throw new ThreadRejectedError([`no local relay adapter registered for role ${role}`])
  }

  private async persist(thread: ConversationThread): Promise<ConversationThread> {
    await writeJsonAtomic(this.threadPath(thread.threadId), thread)
    return thread
  }

  private eventsPath(threadId: string): string {
    return path.join(this.threadDirectory(threadId), 'thread-events.jsonl')
  }

  private async record(threadId: string, type: string, details: Record<string, unknown>): Promise<void> {
    await appendEvent(this.eventsPath(threadId), { type, at: this.now(), threadId, ...details })
  }

  private readThreadEvents(threadId: string): Promise<JobEvent[]> {
    return readEvents(this.eventsPath(threadId))
  }

  /**
   * How many dispatches have already been attempted for this sequence. Counted from the Ledger
   * rather than the clock, so a fixed test clock cannot collapse two attempts into one id.
   */
  private attemptForSequence(events: readonly JobEvent[], sequence: number): number {
    return events.filter((event) => event.type === 'relay.dispatch-intent' && typeof event.sequence === 'number' && event.sequence === sequence).length
  }

  private recordedDispatchIds(events: readonly JobEvent[]): Set<string> {
    const ids = new Set<string>()
    for (const event of events) if (typeof event.dispatchId === 'string') ids.add(event.dispatchId)
    return ids
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
    if (existing) {
      if (existing.taskId !== packet.taskId
        || existing.jobId !== registration.jobId
        || existing.approvalId !== packet.approval.approvalId
        || existing.scopeHash !== packet.scopeHash
        || existing.contextHash !== packet.contextHash
        || existing.routingPlanHash !== packet.approval.routingPlanHash
        || hashJson(existing.adapterPlan) !== hashJson(packet.adapterPlan)
        || hashJson(existing.approvedFileSet ?? []) !== hashJson(packet.target.allowedFiles ?? [])
        || existing.inputHash !== registration.inputHash
        || hashJson(existing.implementationBinding ?? null) !== hashJson(packet.implementationBinding ?? null)) {
        throw new ThreadRejectedError(['existing Thread binding does not match the approved Packet; recovery-needed'])
      }
      return existing
    }

    const thread = createThread({
      threadId: id,
      taskId: packet.taskId,
      jobId: registration.jobId,
      title: options.title ?? packet.objective,
      approvalId: packet.approval.approvalId,
      scopeHash: packet.scopeHash,
      contextHash: packet.contextHash,
      routingPlanHash: packet.approval.routingPlanHash,
      adapterPlan: packet.adapterPlan,
      approvedFileSet: packet.target.allowedFiles,
      ...(packet.implementationBinding ? { implementationBinding: packet.implementationBinding } : {}),
      inputHash: registration.inputHash,
      createdAt: this.now(),
      maxTurns: options.maxTurns ?? defaultMaxTurns
    })
    await this.record(id, 'thread.created', { taskId: packet.taskId, jobId: registration.jobId, approvalId: packet.approval.approvalId, packetHash: job.packetHash, maxTurns: thread.maxTurns })
    return this.persist(thread)
  }

  /** `send_to_adapter`: hand the approved Thread context to the Adapter and claim the pending dispatch. */
  sendToAdapter(threadId: string, adapterId?: string, dependencyResults?: readonly AdapterDependencyResult[], orchestrationRunId?: string): Promise<RelayDispatchHandle> {
    return this.serialise(threadId, () => this.sendToAdapterUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId))
  }

  private async sendToAdapterUnsafe(threadId: string, adapterId?: string, dependencyResults?: readonly AdapterDependencyResult[], orchestrationRunId?: string): Promise<RelayDispatchHandle> {
    const thread = await this.getConversationState(threadId)
    if (thread.state !== 'open') throw new ThreadRejectedError([`thread is not open: ${thread.state}`])
    if (thread.turns.length >= thread.maxTurns) throw new ThreadRejectedError([`max turns exceeded: ${thread.maxTurns}`])

    const pending = await this.readPending(threadId)
    if (pending) throw new ThreadRejectedError([`a dispatch is already pending for turn ${pending.handle.sequence}`])

    const expectedRole = this.nextRole(thread)
    const adapter = adapterId ? this.resolveAdapter(adapterId) : this.adapterForRole(expectedRole)
    if (!adapterSupportsRole(adapter, expectedRole)) throw new ThreadRejectedError([`turn ${thread.turns.length} requires role ${expectedRole}, but ${adapter.adapterId} supports ${(adapter.supportedRoles ?? [adapter.role]).join(', ')}`])
    if (adapterId) this.assertExplicitDispatchIsApprovedPlan(thread, adapterId, expectedRole)

    const parent = lastTurn(thread)
    const sequence = thread.turns.length
    const events = await this.readThreadEvents(threadId)
    const attempt = this.attemptForSequence(events, sequence)
    const dispatchId = `relay-dispatch-${hashJson([threadId, sequence, adapter.adapterId, attempt]).slice(0, 20)}`
    if (this.recordedDispatchIds(events).has(dispatchId)) {
      throw new ThreadRejectedError([`dispatchId ${dispatchId} was already used on this thread; refusing to reuse it`])
    }

    const sentAt = this.now()
    const handle: RelayDispatchHandle = {
      dispatchId,
      threadId,
      taskId: thread.taskId,
      jobId: thread.jobId,
      adapterId: adapter.adapterId,
      role: expectedRole,
      sequence,
      attempt,
      ...(parent ? { respondsToTurnId: parent.turnId, respondsToHash: turnHash(parent) } : {}),
      sentAt,
      expiresAt: new Date(new Date(sentAt).getTime() + this.pendingTtlMs).toISOString(),
      ...(dependencyResults?.length ? { dependencyResults: [...dependencyResults] } : {}),
      ...(orchestrationRunId ? { orchestrationRunId } : {})
    }

    // Recorded before the send so an interruption between send and persistence stays visible.
    await this.record(threadId, 'relay.dispatch-intent', { dispatchId, adapterId: adapter.adapterId, role: expectedRole, sequence, attempt })

    let acceptance: AdapterAcceptance
    this.inFlight.set(threadId, { dispatchId, adapterId: adapter.adapterId })
    try {
      acceptance = await adapter.send({
        dispatchId,
        taskId: thread.taskId,
        threadId,
        jobId: thread.jobId,
        title: thread.title,
        role: expectedRole,
        sequence,
        priorTurns: thread.turns,
        attempt,
        inputHash: thread.inputHash,
        scopeHash: thread.scopeHash,
        contextHash: thread.contextHash,
        ...(thread.approvedFileSet ? { approvedFileSet: thread.approvedFileSet } : {}),
        ...(orchestrationRunId ? { orchestrationRunId } : {}),
        ...(dependencyResults?.length ? { dependencyResults } : {})
      })
    } catch (error) {
      // A throw does not prove nothing was sent, so the intent stays unresolved on purpose.
      await this.record(threadId, 'relay.send-failed', { dispatchId, adapterId: adapter.adapterId, sequence, attempt, sendError: safeErrorText(error) })
      throw error
    } finally {
      this.inFlight.delete(threadId)
    }
    if (acceptance.dispatchId !== dispatchId || acceptance.adapterId !== adapter.adapterId) {
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
      ...(answer.questions ? { questions: answer.questions } : {}),
      ...(stored.dependencyResults?.length ? { dependencyResults: stored.dependencyResults } : {}),
      ...(stored.orchestrationRunId ? { orchestrationRunId: stored.orchestrationRunId } : {}),
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
      status: answer.envelopeStatus ?? answer.status,
      content: answer.content,
      summary: answer.summary ?? answer.content.slice(0, 200),
      artifact: { ...(answer.artifact ?? {}), turnId, threadId: thread.threadId, sequence: stored.sequence, respondsToTurnId: stored.respondsToTurnId ?? null },
      verification: answer.verification ?? [],
      risks: answer.risks ?? [],
      ...(answer.questions ? { questions: answer.questions } : {}),
      ...(stored.dependencyResults?.length ? { dependencyResults: stored.dependencyResults } : {}),
      ...(stored.orchestrationRunId ? { orchestrationRunId: stored.orchestrationRunId } : {}),
      ownerDecisionRequired: true,
      nextOwnerDecision: answer.status === 'success' || answer.status === 'partial' ? 'このTurnを確認し、継続・停止・承認を判断する' : 'Turnの失敗理由を確認し、停止または再設計を判断する',
      createdAt,
      durationMs: 0,
      terminationReason: answer.terminationReason ?? (answer.status === 'success' ? 'completed' : `adapter-${answer.status}`)
    }
  }

  /**
   * Builds the Owner gate for one external send. Exposed so the UI can show the report without
   * attempting anything, and reused by the Adapter itself immediately before it would transmit.
   */
  async preflightExternalSend(threadId: string, adapterId: string, transport?: ExternalTransport, dependencyResults?: readonly AdapterDependencyResult[]): Promise<ExternalPreflight> {
    const thread = await this.getConversationState(threadId)
    const profile = getAdapterProfile(adapterId)
    // Preflight must use exactly the role the next dispatch requires. Do not fall back to an
    // Adapter's primary role: that would show a passing Proposal preflight for a Critic dispatch
    // that the actual send gate will reject.
    const adapter = this.resolveAdapter(adapterId)
    const nextRole = this.nextRole(thread)
    this.assertAdapterRegistered(adapterId, nextRole)
    const adapterRole = nextRole
    const events = await this.readThreadEvents(threadId)
    const attempt = this.attemptForSequence(events, thread.turns.length)
    const packet = buildSyntheticPacket(thread, adapterRole, attempt, this.now(), dependencyResults)
    assertPacketBoundary(packet)
    return preflightExternalSend({
      profile,
      adapterRole,
      transport: transport ?? this.requireTransport(adapterId),
      packet,
      approval: await readExternalApproval(this.runtimeRoot, threadId),
      sendsAlreadyMade: await this.countExternalCalls(threadId),
      now: this.clock(),
      approvedPlanBinding: { adapterPlan: thread.adapterPlan, routingPlanHash: thread.routingPlanHash }
    })
  }

  private requireTransport(adapterId: string): ExternalTransport {
    const transport = this.externalTransports.get(adapterId)
    if (!transport) throw new ThreadRejectedError([`no external transport registered for ${adapterId}`])
    return transport
  }

  /**
   * Owner cancel by threadId. The renderer never holds an Adapter instance, so the abort path
   * runs entirely inside the main process.
   */
  cancelExternalSend(threadId: string, reason = 'cancelled by Owner'): boolean {
    const open = this.inFlight.get(threadId)
    if (!open) return false
    const adapter = this.adapters.get(open.adapterId)
    return adapter?.cancel?.(open.dispatchId, reason) ?? false
  }

  /** True while an external dispatch is open for this Thread, so the UI can enable cancel. */
  hasInFlightExternalSend(threadId: string): boolean {
    return this.inFlight.has(threadId)
  }

  /** Hooks an external Adapter uses to obtain its packet, pass the Owner gate, and record the call. */
  externalHooks(adapterId: string, transport: ExternalTransport): ExternalAdapterHooks {
    return {
      authorise: async (request) => {
        const thread = await this.getConversationState(request.threadId)
        const profile = getAdapterProfile(adapterId)
        const packet = buildSyntheticPacket(thread, request.role, request.attempt ?? 0, this.now(), request.dependencyResults)
        assertPacketBoundary(packet)
        const preflight = preflightExternalSend({
          profile,
          adapterRole: request.role,
          transport,
          packet,
          approval: await readExternalApproval(this.runtimeRoot, request.threadId),
          sendsAlreadyMade: await this.countExternalCalls(request.threadId),
          now: this.clock(),
          approvedPlanBinding: { adapterPlan: thread.adapterPlan, routingPlanHash: thread.routingPlanHash }
        })
        assertExternalSendAllowed(preflight)
        await this.record(request.threadId, 'external.preflight-passed', { provider: preflight.provider, adapterId: preflight.adapterId, packetHash: preflight.packetHash, approvalId: preflight.approvalId, costTier: preflight.costTier })
        return { packet, preflight }
      },
      recordCall: async (record) => {
        await appendEvent(path.join(this.threadDirectory(record.threadId), 'external-calls.jsonl'), record as unknown as JobEvent)
        await this.record(record.threadId, 'external.call-recorded', { callId: record.callId, provider: record.provider, status: record.status, durationMs: record.durationMs, costTier: record.costTier, terminationReason: record.terminationReason })
      },
      now: () => this.clock()
    }
  }

  private async countExternalCalls(threadId: string): Promise<number> {
    return (await readEvents(path.join(this.threadDirectory(threadId), 'external-calls.jsonl'))).length
  }

  private async writeEvidenceLinks(thread: ConversationThread): Promise<void> {
    await writeJsonAtomic(path.join(this.threadDirectory(thread.threadId), 'evidence-links.json'), {
      threadId: thread.threadId,
      taskId: thread.taskId,
      jobId: thread.jobId,
      approvalId: thread.approvalId,
      jobLedger: `jobs/${thread.jobId}/`,
      turns: thread.turns.map((turn) => ({ turnId: turn.turnId, adapterId: turn.adapterId, role: turn.role, status: turn.status, resultEnvelopeRef: turn.resultEnvelopeRef ?? null, resultEnvelopeHash: turn.resultEnvelopeHash ?? null }))
    })
  }

  /**
   * `continue_job`: add the next Turn to the same Thread. The Adapter is polled through its own
   * `getState`, so an external Adapter that answers later plugs in without changing this flow.
   */
  continueJob(threadId: string, adapterId?: string, dependencyResults?: readonly AdapterDependencyResult[], orchestrationRunId?: string): Promise<ConversationThread> {
    return this.serialise(threadId, () => this.continueJobUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId))
  }

  private async continueJobUnsafe(threadId: string, adapterId?: string, dependencyResults?: readonly AdapterDependencyResult[], orchestrationRunId?: string): Promise<ConversationThread> {
    const thread = await this.getConversationState(threadId)
    if (thread.state === 'recovery-needed') throw new ThreadRejectedError(['thread needs recovery; use a recovery action first'])
    if (thread.turns.length >= thread.maxTurns) {
      const stopped = withState(thread, 'failed', this.now(), `max turns reached: ${thread.maxTurns}`)
      await this.record(threadId, 'thread.state', { state: stopped.state, stopReason: stopped.stopReason })
      await this.syncJobState(stopped, 'failed')
      return this.persist(stopped)
    }

    const handle = await this.sendToAdapterUnsafe(threadId, adapterId, dependencyResults, orchestrationRunId)
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

  /**
   * One startup pass over every Thread. Detects sends that were interrupted and moves those
   * Threads to `recovery-needed`. Never retries, never resends, never blocks on one bad Adapter.
   */
  async scanForRecovery(): Promise<ThreadSummary[]> {
    const detected: ThreadSummary[] = []
    for (const threadId of await this.threadIds()) {
      try {
        const found = await this.serialise(threadId, () => this.detectRecoveryUnsafe(threadId))
        if (found) detected.push(summarize(found))
      } catch (error) {
        // A single unreadable Thread must not stop the scan of the others.
        await this.record(threadId, 'recovery.scan-failed', { scanError: safeErrorText(error) }).catch(() => undefined)
      }
    }
    return detected
  }

  private async detectRecoveryUnsafe(threadId: string): Promise<ConversationThread | null> {
    const thread = await this.tryRead(threadId)
    if (!thread || thread.state !== 'open') return null

    const pending = await this.readPending(threadId)
    if (pending) return this.detectFromPending(thread, pending)

    const orphan = this.unresolvedIntent(await this.readThreadEvents(threadId), thread)
    if (!orphan) return null
    return this.persist(await this.enterRecoveryFor(thread, {
      reason: 'send-unconfirmed',
      dispatchId: String(orphan.dispatchId),
      sequence: Number(orphan.sequence),
      adapterId: String(orphan.adapterId),
      role: orphan.role as RecoveryInfo['role'],
      attempt: Number(orphan.attempt ?? 0),
      sentAt: String(orphan.at),
      detectedAt: this.now()
    }))
  }

  private async detectFromPending(thread: ConversationThread, pending: PendingDispatch): Promise<ConversationThread | null> {
    const { handle } = pending
    let probeError: string | undefined
    try {
      const adapter = this.resolveAdapter(handle.adapterId)
      // Probed once. A retry loop here would be an automatic recovery, which this design forbids.
      if ((await adapter.getState(pending.acceptance)) === 'ready') return null
    } catch (error) {
      probeError = safeErrorText(error)
    }
    return this.persist(await this.enterRecoveryFor(thread, {
      reason: 'answer-unavailable',
      dispatchId: handle.dispatchId,
      sequence: handle.sequence,
      adapterId: handle.adapterId,
      role: handle.role,
      attempt: handle.attempt,
      sentAt: handle.sentAt,
      expiresAt: handle.expiresAt,
      ...(handle.respondsToTurnId ? { respondsToTurnId: handle.respondsToTurnId, respondsToHash: handle.respondsToHash } : {}),
      detectedAt: this.now(),
      ...(probeError ? { probeError } : {})
    }))
  }

  private async enterRecoveryFor(thread: ConversationThread, info: RecoveryInfo): Promise<ConversationThread> {
    const moved = enterRecovery(thread, info, this.now())
    await this.record(thread.threadId, 'recovery.detected', { reason: info.reason, dispatchId: info.dispatchId, sequence: info.sequence, adapterId: info.adapterId, attempt: info.attempt, ...(info.probeError ? { probeError: info.probeError } : {}) })
    await this.syncJobState(moved, 'recovery-needed')
    return moved
  }

  /**
   * The interrupted dispatch, if any.
   *
   * Only the newest attempt of each sequence is judged: an earlier attempt that was superseded by a
   * later one is history, not an outstanding send. Judging every intent would report a stale
   * `relay.send-failed` attempt as unconfirmed long after a later attempt of the same sequence
   * succeeded. Within the newest attempt, resolution is by `dispatchId`, which keeps a second
   * interruption at the same sequence detectable after a resend.
   */
  private unresolvedIntent(events: readonly JobEvent[], thread: ConversationThread): JobEvent | null {
    const settled = new Set<string>()
    for (const turn of thread.turns) if (turn.dispatchId) settled.add(turn.dispatchId)
    const answered = new Set<number>(thread.turns.map((turn) => turn.sequence))
    for (const event of events) {
      // `relay.send-failed` is an observation, not proof that nothing was sent, so it never settles.
      if (event.type === 'relay.dispatch-intent' || event.type === 'relay.send-failed') continue
      for (const key of ['dispatchId', 'previousDispatchId'] as const) {
        const value = event[key]
        if (typeof value === 'string') settled.add(value)
      }
    }

    const newestPerSequence = new Map<number, JobEvent>()
    for (const event of events) {
      if (event.type !== 'relay.dispatch-intent') continue
      const { sequence, attempt, dispatchId } = event
      if (typeof sequence !== 'number' || typeof dispatchId !== 'string') continue
      const current = newestPerSequence.get(sequence)
      const currentAttempt = typeof current?.attempt === 'number' ? current.attempt : -1
      if (!current || (typeof attempt === 'number' ? attempt : 0) >= currentAttempt) newestPerSequence.set(sequence, event)
    }

    const outstanding = [...newestPerSequence.entries()]
      .filter(([sequence, event]) => !answered.has(sequence) && !settled.has(event.dispatchId as string))
      .map(([, event]) => event)
    return outstanding[outstanding.length - 1] ?? null
  }

  private async threadIds(): Promise<string[]> {
    try {
      return (await readdir(path.join(this.runtimeRoot, 'threads'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
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
    // Checked before Evidence: a Thread in recovery must be resolved by a recovery action first.
    if (thread.state === 'recovery-needed') {
      throw new ThreadRejectedError([`thread needs recovery; use a recovery action instead of ${action}`])
    }
    if (action === 'approve') await this.verifyStoredEvidence(thread)
    const decided = applyOwnerDecision(thread, action, this.now(), note)
    await this.record(threadId, 'owner.decision', { action, state: decided.state, ...(note ? { note } : {}) })
    const jobState = this.jobStateForThread(decided.state)
    if (jobState) await this.syncJobState(decided, jobState)
    return this.persist(decided)
  }

  /** Owner recovery: discard the interrupted dispatch and send the same sequence again. */
  resendFromRecovery(threadId: string, note?: string): Promise<ConversationThread> {
    return this.serialise(threadId, async () => {
      const thread = await this.requireRecovery(threadId)
      const previous = thread.recovery as RecoveryInfo
      await this.clearPending(threadId)
      await this.persist(leaveRecovery(thread, 'open', this.now()))
      // Records the abandoned dispatchId so a later scan does not detect its intent again.
      await this.record(threadId, 'recovery.resent', { reason: previous.reason, previousDispatchId: previous.dispatchId, sequence: previous.sequence, previousAttempt: previous.attempt, ...(note ? { note } : {}) })
      // One Owner action: dispatch and take the answer, exactly like an ordinary continue.
      return this.continueJobUnsafe(threadId, previous.adapterId)
    })
  }

  /** Owner recovery: record that no answer was obtained, as a `failed` Turn with Evidence. */
  recordRecoveryFailure(threadId: string, note?: string): Promise<ConversationThread> {
    return this.serialise(threadId, async () => {
      const thread = await this.requireRecovery(threadId)
      const info = thread.recovery as RecoveryInfo
      const turnId = `turn-${info.sequence}-recovery-${info.attempt}`
      const recordedAt = this.now()

      const errorRecord = {
        reason: info.reason,
        dispatchId: info.dispatchId,
        sequence: info.sequence,
        adapterId: info.adapterId,
        role: info.role,
        attempt: info.attempt,
        sentAt: info.sentAt,
        ...(info.expiresAt ? { expiresAt: info.expiresAt } : {}),
        detectedAt: info.detectedAt,
        recordedAt,
        ...(info.probeError ? { probeError: info.probeError } : {}),
        ...(note ? { note } : {})
      }
      const errorRef = `threads/${threadId}/errors/${turnId}.json`
      await writeJsonAtomic(path.join(this.threadDirectory(threadId), 'errors', `${turnId}.json`), errorRecord)

      const envelope: AdapterResultEnvelope = {
        resultId: turnId,
        jobId: thread.jobId,
        taskId: thread.taskId,
        adapterId: info.adapterId,
        role: info.role,
        inputHash: thread.inputHash,
        scopeHash: thread.scopeHash,
        contextHash: thread.contextHash,
        status: 'failed',
        content: info.reason === 'answer-unavailable'
          ? 'Adapterは受理したが回答を取得できなかった。'
          : 'Adapterへ届いたか確認できないまま中断した。',
        summary: info.reason === 'answer-unavailable'
          ? `Adapterは受理したが回答を取得できなかった（sequence ${info.sequence}、attempt ${info.attempt}）`
          : `Adapterへ届いたか確認できないまま中断した（sequence ${info.sequence}、attempt ${info.attempt}）`,
        artifact: { turnId, threadId, sequence: info.sequence, dispatchId: info.dispatchId, errorRef },
        verification: [{ name: 'adapter-answer-recovered', status: 'not-run', reason: info.reason }],
        risks: info.reason === 'answer-unavailable'
          ? ['Adapterが処理を完了していた可能性がある']
          : ['Adapterへ届いたか不明であり、外部AIでは課金が発生している可能性がある'],
        ownerDecisionRequired: true,
        nextOwnerDecision: 'この中断を踏まえ、停止・再依頼・これまでのTurnの扱いを判断する',
        createdAt: recordedAt,
        durationMs: 0,
        terminationReason: 'recovery-failed'
      }
      validateResultEnvelope(envelope, { taskId: thread.taskId, jobId: thread.jobId, inputHash: thread.inputHash })
      await writeJsonAtomic(this.resultPath(threadId, turnId), envelope)

      // Derived from the Thread, not from the stored info: a Case B intent carries no parent ref.
      const parent = lastTurn(thread)
      const turn: ConversationTurn = {
        turnId,
        threadId,
        jobId: thread.jobId,
        dispatchId: info.dispatchId,
        sequence: info.sequence,
        adapterId: info.adapterId,
        role: info.role,
        ...(parent ? { respondsToTurnId: parent.turnId, respondsToHash: turnHash(parent) } : {}),
        content: `【ADFによる復旧記録】このTurnはAdapterの発言ではない。${envelope.summary}。`,
        status: 'failed',
        resultEnvelopeRef: `threads/${threadId}/results/${turnId}.json`,
        resultEnvelopeHash: hashJson(envelope),
        errorRef,
        createdAt: recordedAt
      }

      const appended = appendRecoveryTurn(thread, turn)
      await this.clearPending(threadId)
      await this.writeEvidenceLinks(appended)
      await this.record(threadId, 'recovery.failed-recorded', { reason: info.reason, dispatchId: info.dispatchId, sequence: info.sequence, turnId, ...(note ? { note } : {}) })
      const resolved = leaveRecovery(appended, 'awaiting-owner', recordedAt)
      // The conversation is live again, so the Job leaves recovery too.
      await this.syncJobState(resolved, 'running')
      return this.persist(resolved)
    })
  }

  /** Owner recovery: abandon the Thread. */
  stopFromRecovery(threadId: string, note?: string): Promise<ConversationThread> {
    return this.serialise(threadId, async () => {
      const thread = await this.requireRecovery(threadId)
      const info = thread.recovery as RecoveryInfo
      await this.clearPending(threadId)
      const stopped = leaveRecovery(thread, 'stopped', this.now(), note ?? `stopped during recovery: ${info.reason}`)
      await this.record(threadId, 'recovery.stopped', { reason: info.reason, dispatchId: info.dispatchId, sequence: info.sequence, ...(note ? { note } : {}) })
      await this.syncJobState(stopped, 'cancelled')
      return this.persist(stopped)
    })
  }

  private async requireRecovery(threadId: string): Promise<ConversationThread> {
    const thread = await this.getConversationState(threadId)
    if (thread.state !== 'recovery-needed' || !thread.recovery) {
      throw new ThreadRejectedError([`thread is not awaiting recovery: ${thread.state}`])
    }
    return thread
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
    const summaries: ThreadSummary[] = []
    for (const threadId of await this.threadIds()) {
      const thread = await this.tryRead(threadId)
      if (thread) summaries.push(summarize(thread))
    }
    return summaries
  }

  /**
   * Read-only, Registry-derived candidates for explicit external dispatch — Fake Adapters excluded.
   * Returns only Adapters actually registered on *this* Relay instance, never the full static
   * Registry: a Registry entry marked `available` that this instance never wired up would otherwise
   * look selectable in the UI and then fail with "not registered in this relay" the moment it's used.
   */
  listExternalAdapterProfiles(): AdapterProfile[] {
    return [...this.adapters.keys()]
      .map((adapterId) => getAdapterProfile(adapterId))
      .filter((profile) => profile.connection !== 'fake')
  }
}
