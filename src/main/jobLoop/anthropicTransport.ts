import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { CredentialStatus, ExternalTransport, TransportOptions } from './externalTransport'
import { truncateAnswer } from './externalTransport'

/**
 * Messages API transport over the built-in `fetch`. Chosen by Project Owner after the environment
 * preflight found no Claude CLI and no SDK installed: this adds no dependency to ADF.
 *
 * The API key is read from the environment at send time and never returned, logged, persisted to
 * the Ledger, or written into any ADF record.
 */
export const anthropicMessagesEndpoint = 'https://api.anthropic.com/v1/messages'
export const anthropicApiVersion = '2023-06-01'
export const defaultModel = 'claude-opus-5'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export class MissingCredentialError extends Error {
  readonly code = 'MISSING_CREDENTIAL'
  constructor(variable: string) {
    super(`${variable} is not set in this process environment; ADF does not store credentials`)
  }
}

interface AnthropicTextBlock {
  type: string
  text?: string
}

interface AnthropicResponseBody {
  content?: AnthropicTextBlock[]
  stop_reason?: string
  stop_details?: { category?: string | null } | null
  model?: string
}

export interface AnthropicTransportOptions {
  providerId?: string
  model?: string
  /** Injected for verification so tests never touch the network. */
  fetchImpl?: FetchLike
  /** Name of the environment variable holding the key. The value is never stored by ADF. */
  credentialVariable?: string
}

export class AnthropicMessagesTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'api'
  private readonly model: string
  private readonly fetchImpl: FetchLike
  private readonly credentialVariable: string

  constructor({ providerId = 'anthropic-messages-api', model = defaultModel, fetchImpl, credentialVariable = 'ANTHROPIC_API_KEY' }: AnthropicTransportOptions = {}) {
    this.providerId = providerId
    this.model = model
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
    this.credentialVariable = credentialVariable
  }

  /**
   * Presence only. The value is read here to test it and immediately discarded — it is never
   * returned, logged, or stored, so the Owner gate can report "set / unset" and nothing more.
   */
  credentialStatus(): CredentialStatus {
    return { required: true, present: Boolean(process.env[this.credentialVariable]?.trim()), source: `environment variable ${this.credentialVariable}`, authMode: 'environment-secret' }
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    const key = process.env[this.credentialVariable]
    if (!key) throw new MissingCredentialError(this.credentialVariable)

    const startedAt = Date.now()
    // Already cancelled: never open the request at all.
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }
    }
    const controller = new AbortController()
    // Two distinct abort causes share one controller so the outcome can tell them apart:
    // the deadline elapsing is a `timeout`, an Owner cancel is a `cancelled`.
    const timeoutReason = Symbol('external-send-timeout')
    const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs)
    const relayAbort = (): void => controller.abort(options.signal?.reason ?? new Error('cancelled by Owner'))
    options.signal?.addEventListener('abort', relayAbort, { once: true })

    try {
      const response = await this.fetchImpl(anthropicMessagesEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': anthropicApiVersion,
          'x-api-key': key
        },
        // Thinking is on by default on this model family and shares the max_tokens budget with the
        // answer. A connectivity probe wants a short deterministic reply, so thinking is disabled —
        // accepted at the default `high` effort and below.
        body: JSON.stringify({
          model: this.model,
          max_tokens: 512,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}` }]
        }),
        signal: controller.signal
      })

      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        return { status: this.statusForHttp(response.status), terminationReason: `http-${response.status}`, durationMs, errorText: (await this.safeBody(response)).slice(0, 200) }
      }

      const body = (await response.json()) as AnthropicResponseBody
      if (body.stop_reason === 'refusal') {
        return { status: 'failed', terminationReason: `refusal:${body.stop_details?.category ?? 'unspecified'}`, durationMs }
      }

      const text = (body.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('').trim()
      if (!text) return { status: 'invalid', terminationReason: `no-text-block:${body.stop_reason ?? 'unknown'}`, durationMs }

      return {
        status: 'success',
        content: truncateAnswer(text),
        terminationReason: body.stop_reason === 'max_tokens' ? 'completed-truncated' : 'completed',
        durationMs
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      if (controller.signal.aborted) {
        return controller.signal.reason === timeoutReason
          ? { status: 'timeout', terminationReason: `no answer within ${options.timeoutMs}ms`, durationMs }
          : { status: 'cancelled', terminationReason: 'cancelled before the adapter answered', durationMs }
      }
      throw error
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', relayAbort)
    }
  }

  /** 429 and 5xx are retryable conditions for the Owner to judge; 4xx are refusals to send. */
  private statusForHttp(status: number): ExternalSendOutcome['status'] {
    if (status === 429 || status >= 500) return 'failed'
    if (status === 401 || status === 403) return 'failed'
    return 'invalid'
  }

  private async safeBody(response: Response): Promise<string> {
    try {
      return await response.text()
    } catch {
      return 'response body unavailable'
    }
  }
}
