import type { AdapterConnection } from '../../shared/jobLoopTypes'
import type { ExternalSendOutcome, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { CredentialStatus, ExternalTransport, TransportOptions } from './externalTransport'
import { truncateAnswer } from './externalTransport'

/**
 * Local HTTP transport for Ollama (or any Ollama-compatible localhost server). One implementation
 * of `ExternalTransport` among others (Anthropic Messages API, future OpenAI/CLI transports) — the
 * `local-http` connection mode is not a special case anywhere in Thread, Relay, or Recovery.
 *
 * `ADF-OLLAMA-LIVE-CONNECTION-001`: `ollama-local` is `status: 'available'` in the Registry for
 * explicit-adapterId dispatch, but auto-routing still excludes `local-http` (`supports()`), and the
 * live Electron app's `index.ts` does not register an Adapter instance for it — only a dedicated,
 * Owner-run probe (`src/cli/ollamaConnectivityProbe.ts`) can reach it.
 */
export const defaultOllamaBaseUrl = 'http://127.0.0.1:11434'
export const defaultOllamaModel = 'llama3'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

interface OllamaGenerateResponse {
  response?: string
  done?: boolean
  error?: string
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>
}

export interface OllamaReadiness {
  reachable: boolean
  modelPresent: boolean
  models: string[]
  detail: string
}

/**
 * Read-only `/api/tags` check, entirely separate from `preflightExternalSend` (which is not
 * modified by this Task). Confirms the server answers and the expected model is pulled, before any
 * `send()` is attempted. A model name without a tag matches its `:latest` — Ollama's own convention.
 */
export async function checkOllamaReadiness(
  { baseUrl = defaultOllamaBaseUrl, model = defaultOllamaModel, fetchImpl }: { baseUrl?: string; model?: string; fetchImpl?: FetchLike } = {}
): Promise<OllamaReadiness> {
  const fetchFn = fetchImpl ?? ((input, init) => fetch(input, init))
  let response: Response
  try {
    response = await fetchFn(`${baseUrl}/api/tags`, { method: 'GET', redirect: 'error' })
  } catch (error) {
    return { reachable: false, modelPresent: false, models: [], detail: `not reachable: ${String((error as Error)?.message ?? error)}`.slice(0, 200) }
  }
  if (!response.ok) return { reachable: false, modelPresent: false, models: [], detail: `http-${response.status}` }

  let body: OllamaTagsResponse
  try {
    body = (await response.json()) as OllamaTagsResponse
  } catch {
    return { reachable: true, modelPresent: false, models: [], detail: 'malformed /api/tags response' }
  }
  const models = (body.models ?? []).map((entry) => entry.model ?? entry.name ?? '').filter(Boolean)
  // Bare "llama3" must match the pulled "llama3:latest" — Ollama's own tag-omission convention.
  const modelPresent = models.some((name) => name === model || name === `${model}:latest` || name.split(':')[0] === model)
  return { reachable: true, modelPresent, models, detail: modelPresent ? `model ${model} present` : `model ${model} not found among: ${models.join(', ') || '(none)'}` }
}

export interface OllamaTransportOptions {
  providerId?: string
  baseUrl?: string
  model?: string
  /** Injected for verification so tests never touch a real Ollama server. */
  fetchImpl?: FetchLike
}

export class OllamaLocalHttpTransport implements ExternalTransport {
  readonly providerId: string
  readonly connection: AdapterConnection = 'local-http'
  private readonly baseUrl: string
  private readonly model: string
  private readonly fetchImpl: FetchLike

  constructor({ providerId = 'ollama-local-http', baseUrl = defaultOllamaBaseUrl, model = defaultOllamaModel, fetchImpl }: OllamaTransportOptions = {}) {
    this.providerId = providerId
    this.baseUrl = baseUrl
    this.model = model
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
  }

  /** Ollama is unauthenticated by default. No credential to check. */
  credentialStatus(): CredentialStatus {
    return { required: false, present: true, source: 'none — local HTTP endpoint', authMode: 'none' }
  }

  /**
   * The only thing that makes `local-only` honest for this transport: the configured target must
   * actually be the loopback interface, not an external host a misconfiguration could point at
   * (e.g. an Ollama Cloud URL). Backs the `local-endpoint-confirmed` preflight check.
   */
  isLocalEndpoint(): boolean {
    let parsed: URL
    try {
      parsed = new URL(this.baseUrl)
    } catch {
      return false
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    const host = parsed.hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  }

  async send(packet: SyntheticPacket, options: TransportOptions): Promise<ExternalSendOutcome> {
    const startedAt = Date.now()
    // Already cancelled: never open the request at all.
    if (options.signal?.aborted) {
      return { status: 'cancelled', terminationReason: 'cancelled before the request was sent', durationMs: 0 }
    }
    const controller = new AbortController()
    const timeoutReason = Symbol('external-send-timeout')
    const timer = setTimeout(() => controller.abort(timeoutReason), options.timeoutMs)
    const relayAbort = (): void => controller.abort(options.signal?.reason ?? new Error('cancelled by Owner'))
    options.signal?.addEventListener('abort', relayAbort, { once: true })

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          prompt: `${packet.instruction}\n\n役割: ${packet.role}\n形式: ${packet.resultFormat}`
        }),
        signal: controller.signal
      })

      const durationMs = Date.now() - startedAt
      if (!response.ok) {
        return { status: this.statusForHttp(response.status), terminationReason: `http-${response.status}`, durationMs, errorText: (await this.safeBody(response)).slice(0, 200) }
      }

      const body = (await response.json()) as OllamaGenerateResponse
      if (body.error) return { status: 'failed', terminationReason: `ollama-error:${body.error}`.slice(0, 200), durationMs }

      const text = (body.response ?? '').trim()
      if (!text) return { status: 'invalid', terminationReason: 'no-response-text', durationMs }

      return { status: 'success', content: truncateAnswer(text), terminationReason: 'completed', durationMs }
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
