import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalPerformanceMetrics, ExternalSendOutcome, LocalModelReadiness, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { CredentialStatus, ExternalTransport, TransportOptions, TransportReadiness } from './externalTransport'
import { truncateAnswer } from './externalTransport'

export const defaultLocalOpenAiCompatibleBaseUrl = 'http://127.0.0.1:1234'

export type LocalOpenAiCompatibleFetchLike = (input: string, init: RequestInit) => Promise<Response>

interface LocalOpenAiCompatibleResponse {
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown }
  error?: { message?: unknown; type?: unknown }
}

interface ModelsResponse {
  data?: Array<{ id?: unknown }>
}

function safeDiagnostic(value: unknown): string {
  return String(value)
    .replace(/(authorization|bearer|api[-_]?key|token|password|secret)=?[^\s,;]*/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[url-redacted]')
    .slice(0, 200)
}

function nonNegativeMetric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function usageMetrics(usage: LocalOpenAiCompatibleResponse['usage']): ExternalPerformanceMetrics | undefined {
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
  return content.map((part) => {
    if (typeof part === 'string') return part
    if (part && typeof part === 'object' && 'text' in part) return typeof part.text === 'string' ? part.text : ''
    return ''
  }).join('').trim()
}

function loopbackBaseUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      && (parsed.pathname === '' || parsed.pathname === '/' || parsed.pathname === '/v1')
      && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)
  } catch {
    return false
  }
}

function apiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1'
}

function modelIds(body: ModelsResponse): string[] {
  return (body.data ?? []).map((entry) => typeof entry.id === 'string' ? entry.id : '').filter(Boolean)
}

export async function checkLocalOpenAiCompatibleReadiness(
  { baseUrl = defaultLocalOpenAiCompatibleBaseUrl, model = '', fetchImpl, timeoutMs = 5_000 }: { baseUrl?: string; model?: string; fetchImpl?: LocalOpenAiCompatibleFetchLike; timeoutMs?: number } = {}
): Promise<LocalModelReadiness> {
  if (!loopbackBaseUrl(baseUrl)) return { reachable: false, modelPresent: false, models: [], baseUrl: '[invalid-local-endpoint]', model, detail: 'invalid local OpenAI-compatible endpoint' }
  const fetchFn = fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchFn(`${apiRoot(baseUrl)}/models`, { method: 'GET', redirect: 'error', signal: controller.signal })
  } catch (error) {
    return { reachable: false, modelPresent: false, models: [], baseUrl, model, detail: controller.signal.aborted ? `readiness timeout after ${timeoutMs}ms` : `not reachable: ${safeDiagnostic((error as Error)?.message ?? error)}` }
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) return { reachable: false, modelPresent: false, models: [], baseUrl, model, detail: `http-${response.status}` }
  let body: ModelsResponse
  try {
    body = (await response.json()) as ModelsResponse
  } catch {
    return { reachable: true, modelPresent: false, models: [], baseUrl, model, detail: 'malformed /v1/models response' }
  }
  const models = modelIds(body)
  const modelPresent = Boolean(model) && models.includes(model)
  return { reachable: true, modelPresent, models, baseUrl, model, detail: model ? (modelPresent ? `model ${model} present` : `model ${model} not found among: ${models.join(', ') || '(none)'}`) : 'LM Studio model is not selected; set LM_STUDIO_MODEL' }
}

export interface LocalOpenAiCompatibleTransportOptions {
  providerId?: string
  baseUrl?: string
  model?: string
  readinessTimeoutMs?: number
  /** Injected for verification so tests never touch a real local server. */
  fetchImpl?: LocalOpenAiCompatibleFetchLike
}

export class LocalOpenAICompatibleTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'local-http'
  private readonly baseUrl: string
  private readonly model: string
  private readonly fetchImpl: LocalOpenAiCompatibleFetchLike
  private readonly readinessTimeoutMs: number

  constructor({ providerId = 'local-openai-compatible', baseUrl = defaultLocalOpenAiCompatibleBaseUrl, model = '', fetchImpl, readinessTimeoutMs = 5_000 }: LocalOpenAiCompatibleTransportOptions = {}) {
    this.providerId = providerId
    this.baseUrl = baseUrl
    this.model = model
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
    this.readinessTimeoutMs = readinessTimeoutMs
  }

  credentialStatus(): CredentialStatus {
    return { required: false, present: true, source: 'none — local HTTP endpoint', authMode: 'none' }
  }

  isLocalEndpoint(): boolean {
    return loopbackBaseUrl(this.baseUrl)
  }

  async localReadiness(): Promise<LocalModelReadiness> {
    return checkLocalOpenAiCompatibleReadiness({ baseUrl: this.baseUrl, model: this.model, fetchImpl: this.fetchImpl, timeoutMs: this.readinessTimeoutMs })
  }

  async checkReadiness(): Promise<TransportReadiness> {
    const readiness = await this.localReadiness()
    return { ready: readiness.reachable && readiness.modelPresent, detail: readiness.detail }
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    const startedAt = Date.now()
    if (!this.isLocalEndpoint()) throw new Error('LM Studio endpoint is not a safe loopback URL')
    if (!this.model) throw new Error('LM Studio model is not selected; set LM_STUDIO_MODEL before dispatch')
    if (options.signal?.aborted) return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }

    const controller = new AbortController()
    const timeoutReason = Symbol('local-openai-compatible-timeout')
    const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs)
    const relayAbort = (): void => controller.abort(options.signal?.reason ?? new Error('cancelled by Owner'))
    options.signal?.addEventListener('abort', relayAbort, { once: true })
    try {
      const response = await this.fetchImpl(`${apiRoot(this.baseUrl)}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          max_tokens: 512,
          temperature: 0,
          messages: [{ role: 'user', content: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}` }]
        }),
        signal: controller.signal
      })
      const durationMs = Date.now() - startedAt
      if (!response.ok) return { status: response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403 ? 'failed' : 'invalid', terminationReason: `http-${response.status}`, durationMs, errorText: (await this.safeBody(response)).slice(0, 200) }
      let body: LocalOpenAiCompatibleResponse
      try {
        body = (await response.json()) as LocalOpenAiCompatibleResponse
      } catch {
        return { status: 'invalid', terminationReason: 'malformed-json-response', durationMs }
      }
      const metrics = usageMetrics(body.usage)
      if (body.error) return { status: 'failed', terminationReason: `provider-error:${safeDiagnostic(body.error.type ?? 'unknown')}`, durationMs, errorText: safeDiagnostic(body.error.message ?? 'LM Studio returned an error'), ...(metrics ? { metrics } : {}) }
      const text = responseText(body.choices?.[0]?.message?.content)
      if (!text) return { status: 'invalid', terminationReason: 'no-response-text', durationMs, ...(metrics ? { metrics } : {}) }
      return { status: 'success', content: truncateAnswer(text), terminationReason: 'completed', durationMs, ...(metrics ? { metrics } : {}) }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      if (controller.signal.aborted) return controller.signal.reason === timeoutReason ? { status: 'timeout', terminationReason: `no answer within ${options.timeoutMs}ms`, durationMs } : { status: 'cancelled', terminationReason: 'cancelled before the adapter answered', durationMs }
      throw error
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', relayAbort)
    }
  }

  private async safeBody(response: Response): Promise<string> {
    try {
      return safeDiagnostic(await response.text())
    } catch {
      return 'response body unavailable'
    }
  }
}
