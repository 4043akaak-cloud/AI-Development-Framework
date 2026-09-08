import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalPerformanceMetrics, ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'
import { MissingCredentialError, type CredentialStatus, type ExternalTransport, type TransportOptions } from './externalTransport'
import { truncateAnswer } from './externalTransport'

export type OpenAICompatibleFetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * Minimal transport for providers exposing the OpenAI-compatible chat-completions shape.
 * Provider identity, endpoint, model, and credential variable remain configuration; Relay,
 * Owner Gate, Result, Evidence, and Ledger stay provider-neutral.
 */
export interface OpenAICompatibleTransportOptions {
  providerId: string
  baseUrl: string
  model: string
  credentialVariable: string
  fetchImpl?: OpenAICompatibleFetchLike
  maxTokens?: number
}

export interface OpenAICompatibleUsage {
  prompt_tokens?: unknown
  completion_tokens?: unknown
  total_tokens?: unknown
}

interface OpenAICompatibleResponse {
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: OpenAICompatibleUsage
  error?: { message?: unknown; type?: unknown }
}

function safeDiagnostic(value: unknown): string {
  return String(value)
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/(authorization|api[-_]?key|token|password|secret)=?[^\s,;]*/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[url-redacted]')
    .slice(0, 200)
}

function nonNegativeMetric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function usageMetrics(usage: OpenAICompatibleUsage | undefined): ExternalPerformanceMetrics | undefined {
  if (!usage) return undefined
  const metrics: ExternalPerformanceMetrics = {}
  const values: Array<[keyof ExternalPerformanceMetrics, unknown]> = [
    ['promptTokens', usage.prompt_tokens],
    ['completionTokens', usage.completion_tokens],
    ['totalTokens', usage.total_tokens]
  ]
  for (const [name, raw] of values) {
    const value = nonNegativeMetric(raw)
    if (value !== undefined) metrics[name] = value
  }
  return Object.keys(metrics).length > 0 ? metrics : undefined
}

function responseText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part) return typeof part.text === 'string' ? part.text : ''
      return ''
    })
    .join('')
    .trim()
}

function endpointFor(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('OpenAI-compatible external endpoint must be an https URL without credentials or query parameters')
  }
  const clean = baseUrl.replace(/\/+$/, '')
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`
}

export class OpenAICompatibleTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'api'
  private readonly endpoint: string
  private readonly model: string
  private readonly credentialVariable: string
  private readonly fetchImpl: OpenAICompatibleFetchLike
  private readonly maxTokens: number

  constructor({ providerId, baseUrl, model, credentialVariable, fetchImpl, maxTokens = 512 }: OpenAICompatibleTransportOptions) {
    this.providerId = providerId
    this.endpoint = endpointFor(baseUrl)
    this.model = model
    this.credentialVariable = credentialVariable
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
    this.maxTokens = maxTokens
  }

  credentialStatus(): CredentialStatus {
    return {
      required: true,
      present: Boolean(process.env[this.credentialVariable]?.trim()),
      source: `environment variable ${this.credentialVariable}`,
      authMode: 'environment-secret'
    }
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    const key = process.env[this.credentialVariable]
    if (!key) throw new MissingCredentialError(this.credentialVariable)

    const startedAt = Date.now()
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }
    }

    const controller = new AbortController()
    const timeoutReason = Symbol('external-send-timeout')
    const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs)
    const relayAbort = (): void => controller.abort(options.signal?.reason ?? new Error('cancelled by Owner'))
    options.signal?.addEventListener('abort', relayAbort, { once: true })

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          max_tokens: this.maxTokens,
          temperature: 0,
          messages: [{ role: 'user', content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}` }]
        }),
        signal: controller.signal
      })

      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        return { status: this.statusForHttp(response.status), terminationReason: `http-${response.status}`, durationMs, errorText: (await this.safeBody(response)).slice(0, 200) }
      }

      let body: OpenAICompatibleResponse
      try {
        body = (await response.json()) as OpenAICompatibleResponse
      } catch {
        return { status: 'invalid', terminationReason: 'malformed-json-response', durationMs }
      }
      const metrics = usageMetrics(body.usage)
      if (body.error) {
        return { status: 'failed', terminationReason: `provider-error:${safeDiagnostic(body.error.type ?? 'unknown')}`, durationMs, errorText: safeDiagnostic(body.error.message ?? 'provider returned an error'), ...(metrics ? { metrics } : {}) }
      }

      const text = responseText(body.choices?.[0]?.message?.content)
      if (!text) return { status: 'invalid', terminationReason: 'no-response-text', durationMs, ...(metrics ? { metrics } : {}) }

      return { status: 'success', content: truncateAnswer(text), terminationReason: 'completed', durationMs, ...(metrics ? { metrics } : {}) }
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

  private statusForHttp(status: number): ExternalSendOutcome['status'] {
    if (status === 429 || status >= 500) return 'failed'
    if (status === 401 || status === 403) return 'failed'
    return 'invalid'
  }

  private async safeBody(response: Response): Promise<string> {
    try {
      return safeDiagnostic(await response.text())
    } catch {
      return 'response body unavailable'
    }
  }
}
