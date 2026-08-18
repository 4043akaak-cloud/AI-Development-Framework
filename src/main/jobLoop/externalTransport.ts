import type { AdapterConnection, AuthMode } from '../../shared/jobLoopTypes'
import type { ExternalPerformanceMetrics, ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'

export interface TransportOptions {
  timeoutMs: number
  signal?: AbortSignal
}

export interface TransportReadiness {
  ready: boolean
  detail: string
}

/**
 * The seam every provider plugs into. A provider is swapped by supplying a different transport;
 * Thread, Relay, Recovery, Result validation and the Owner gates stay identical.
 */
export interface ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection
  /**
   * Whether the credential this transport needs is currently available, and the name of where it
   * is expected. Presence only — implementations must never return, log, or store the value, and
   * callers must never ask for it. A transport that needs no credential reports `required: false`.
   */
  credentialStatus(): CredentialStatus
  /**
   * Required only when `connection` is `'local-http'`. Must return true only when the transport's
   * actual configured target host is `localhost` / `127.0.0.1` — never a self-description, and never
   * trusted for any other connection mode. Backs the `local-endpoint-confirmed` preflight check.
   */
  isLocalEndpoint?(): boolean
  /** Optional live readiness check. It is invoked only by an explicit Owner dispatch action. */
  checkReadiness?(): Promise<TransportReadiness>
  /** Must never read the filesystem, the repo, or the Vault. It receives only the packet. */
  send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome>
}

export interface CredentialStatus {
  required: boolean
  present: boolean
  /** Where the Owner sets it, e.g. an environment variable name. Never the value. */
  source: string
  authMode: AuthMode
}

export const maxAnswerCharacters = 2000

export function truncateAnswer(text: string): string {
  return text.slice(0, maxAnswerCharacters)
}

export interface MockTransportScript {
  status: ExternalSendOutcome['status']
  content?: string
  terminationReason?: string
  errorText?: string
  metrics?: ExternalPerformanceMetrics
  /** Throws instead of resolving, standing in for a transport-level failure. */
  throws?: string
}

/**
 * In-process transport for verification. It performs no network access at all, so the whole
 * external path can be exercised before any external-send approval exists.
 */
export class MockExternalTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'mock'
  readonly received: SyntheticPacket[] = []

  constructor(private readonly script: MockTransportScript, providerId = 'mock-provider') {
    this.providerId = providerId
  }

  /** In-process, so there is nothing to authenticate against. */
  credentialStatus(): CredentialStatus {
    return { required: false, present: true, source: 'none — in-process mock transport', authMode: 'none' }
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    this.received.push(packet)
    if (this.script.throws) throw new Error(this.script.throws)
    if (this.script.status === 'timeout') {
      return { status: 'timeout', terminationReason: `no answer within ${options.timeoutMs}ms`, durationMs: options.timeoutMs, ...(this.script.errorText ? { errorText: this.script.errorText } : {}) }
    }
    return {
      status: this.script.status,
      ...(this.script.content !== undefined ? { content: truncateAnswer(this.script.content) } : {}),
      terminationReason: this.script.terminationReason ?? `mock-${this.script.status}`,
      durationMs: 1,
      ...(this.script.metrics ? { metrics: this.script.metrics } : {}),
      ...(this.script.errorText ? { errorText: this.script.errorText } : {})
    }
  }
}

export class TransportNotConfiguredError extends Error {
  readonly code = 'TRANSPORT_NOT_CONFIGURED'
  constructor(message: string) {
    super(message)
  }
}

/**
 * Placeholder for the first real provider. The connection method is an Owner decision that the
 * environment preflight could not settle, so this transport refuses rather than guessing one.
 */
export class UnconfiguredExternalTransport implements ExternalTransport {
  readonly connection: AdapterConnection = 'unknown'

  constructor(readonly providerId: string, private readonly reason: string) {}

  /** No connection method is decided, so no credential can be present for one. */
  credentialStatus(): CredentialStatus {
    return { required: true, present: false, source: `undecided — ${this.reason}`, authMode: 'unknown' }
  }

  async send(): Promise<ExternalSendOutcome> {
    throw new TransportNotConfiguredError(`no transport is configured for ${this.providerId}: ${this.reason}`)
  }
}
