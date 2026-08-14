import type { AdapterRole } from '../../shared/jobLoopTypes'
import type { ExternalCallRecord, ExternalOutcomeStatus, ExternalPreflight, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { AdapterRunState, RelayTurnPayload } from '../../shared/threadTypes'
import type { AdapterAcceptance, AdapterRequest, ConversationAdapter } from './conversationAdapters'
import { AdapterProtocolError, adapterSupportsRole } from './conversationAdapters'
import type { ExternalTransport } from './externalTransport'

export const defaultExternalTimeoutMs = 60_000

export interface ExternalAdapterHooks {
  /** Resolves the packet, runs the Owner gate, and refuses when anything is unmet. */
  authorise(request: AdapterRequest): Promise<{ packet: SyntheticPacket; preflight: ExternalPreflight }>
  /** Persists one external-call Ledger line. Never receives credentials. */
  recordCall(record: ExternalCallRecord): Promise<void>
  now(): Date
}

/** Turn statuses cannot express timeout or cancellation, so those settle as a failed Turn. */
const turnStatusFor: Record<ExternalOutcomeStatus, RelayTurnPayload['status']> = {
  success: 'success',
  failed: 'failed',
  invalid: 'invalid',
  timeout: 'failed',
  cancelled: 'failed'
}

interface PendingAnswer {
  payload: RelayTurnPayload
  state: AdapterRunState
}

/**
 * One provider behind the common Adapter contract. Everything provider-specific lives in the
 * transport, so a second provider is added by supplying another transport, not by changing Relay,
 * Thread, Recovery, or Result handling.
 */
export class ExternalConversationAdapter implements ConversationAdapter {
  private readonly answers = new Map<string, PendingAnswer>()
  /** One controller per in-flight dispatch, so an Owner cancel reaches the real request. */
  private readonly inFlight = new Map<string, AbortController>()

  readonly role: AdapterRole
  readonly supportedRoles: readonly AdapterRole[]

  constructor(
    readonly adapterId: string,
    role: AdapterRole | readonly AdapterRole[],
    private readonly transport: ExternalTransport,
    private readonly hooks: ExternalAdapterHooks,
    private readonly timeoutMs = defaultExternalTimeoutMs
  ) {
    this.supportedRoles = Array.isArray(role) ? [...role] : [role]
    if (this.supportedRoles.length === 0) throw new AdapterProtocolError(`adapter ${adapterId} must support at least one role`)
    this.role = this.supportedRoles[0]
  }

  async send(request: AdapterRequest): Promise<AdapterAcceptance> {
    if (!adapterSupportsRole(this, request.role)) throw new AdapterProtocolError(`adapter ${this.adapterId} cannot take role ${request.role}`)

    // The gate runs before the transport exists in the call path: no approval, no send.
    const { packet, preflight } = await this.hooks.authorise(request)
    const startedAt = this.hooks.now()

    const controller = new AbortController()
    this.inFlight.set(request.dispatchId, controller)

    let outcome
    try {
      outcome = await this.transport.send(packet, { timeoutMs: this.timeoutMs, signal: controller.signal })
    } catch (error) {
      const finishedAt = this.hooks.now()
      await this.hooks.recordCall(this.buildRecord(request, packet, preflight, {
        status: 'failed',
        terminationReason: 'transport-threw',
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorText: String((error as Error)?.message ?? error).slice(0, 200)
      }, startedAt, finishedAt))
      throw error
    } finally {
      this.inFlight.delete(request.dispatchId)
    }

    const finishedAt = this.hooks.now()
    await this.hooks.recordCall(this.buildRecord(request, packet, preflight, outcome, startedAt, finishedAt))

    const answered = outcome.status === 'success' && Boolean(outcome.content)
    const payload: RelayTurnPayload = {
      content: answered
        ? (outcome.content as string)
        : `【外部Adapter応答なし】provider=${this.transport.providerId} status=${outcome.status} reason=${outcome.terminationReason}`,
      status: answered ? 'success' : turnStatusFor[outcome.status],
      summary: `${this.transport.providerId} / ${request.role} / ${outcome.status}`,
      verification: [{ name: 'external-answer-received', status: answered ? 'pass' : 'not-run', reason: outcome.terminationReason }],
      risks: answered ? [] : ['外部Adapterから採用可能な回答を得られなかった'],
      envelopeStatus: outcome.status,
      terminationReason: outcome.terminationReason,
      ...(outcome.errorText ? { errorRef: `external:${outcome.errorText}` } : {})
    }

    // A definitive failure, timeout, or cancellation is still an answer ADF must record as a Turn,
    // so the Owner sees it with Evidence. `getState` only reports failure when nothing was produced.
    const adapterConversationId = `${this.adapterId}:${request.threadId}:${request.sequence}:${request.attempt ?? 0}`
    this.answers.set(adapterConversationId, { payload, state: 'ready' })
    return { dispatchId: request.dispatchId, adapterId: this.adapterId, adapterConversationId, acceptedAt: startedAt.toISOString() }
  }

  /**
   * Aborts an in-flight external request. Returns false when nothing is in flight for that
   * dispatch — a completed send cannot be recalled, only its Result judged by the Owner.
   */
  cancel(dispatchId: string, reason = 'cancelled by Owner'): boolean {
    const controller = this.inFlight.get(dispatchId)
    if (!controller) return false
    controller.abort(new Error(reason))
    return true
  }

  async getState(acceptance: AdapterAcceptance): Promise<AdapterRunState> {
    return this.answers.get(acceptance.adapterConversationId)?.state ?? 'failed'
  }

  async receive(acceptance: AdapterAcceptance): Promise<RelayTurnPayload> {
    const pending = this.answers.get(acceptance.adapterConversationId)
    if (!pending) throw new AdapterProtocolError(`no pending answer for ${acceptance.adapterConversationId}`)
    this.answers.delete(acceptance.adapterConversationId)
    return pending.payload
  }

  private buildRecord(
    request: AdapterRequest,
    packet: SyntheticPacket,
    preflight: ExternalPreflight,
    outcome: { status: ExternalOutcomeStatus; terminationReason: string; durationMs: number; errorText?: string },
    startedAt: Date,
    finishedAt: Date
  ): ExternalCallRecord {
    return {
      callId: `call-${packet.packetHash.slice(0, 12)}-${request.attempt ?? 0}`,
      approvalId: preflight.approvalId ?? 'none',
      provider: this.transport.providerId,
      adapterId: this.adapterId,
      role: request.role,
      taskId: request.taskId,
      threadId: request.threadId,
      jobId: request.jobId,
      sequence: request.sequence,
      attempt: request.attempt ?? 0,
      packetHash: packet.packetHash,
      inputHash: request.inputHash ?? '',
      scopeHash: request.scopeHash ?? '',
      contextHash: request.contextHash ?? '',
      status: outcome.status,
      costTier: preflight.costTier,
      durationMs: outcome.durationMs,
      terminationReason: outcome.terminationReason,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      ...(outcome.errorText ? { errorText: outcome.errorText } : {})
    }
  }
}
