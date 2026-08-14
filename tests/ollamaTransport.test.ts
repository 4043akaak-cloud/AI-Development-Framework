import { describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { OllamaLocalHttpTransport, checkOllamaReadiness, defaultOllamaBaseUrl, defaultOllamaModel } from '../src/main/jobLoop/ollamaTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-ADAPTER-PROVIDER-NEUTRAL-001', threadId: 'th1', jobId: 'job1', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
const options = { timeoutMs: 1000 }

/** Never reaches a real Ollama server: every call is answered by an injected stub. */
function stub(handler: (init: RequestInit) => Response | Promise<Response>): { calls: RequestInit[]; fetchImpl: (input: string, init: RequestInit) => Promise<Response> } {
  const calls: RequestInit[] = []
  return {
    calls,
    fetchImpl: async (_input, init) => {
      calls.push(init)
      return handler(init)
    }
  }
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('ADF-ADAPTER-PROVIDER-NEUTRAL-001 Ollama local-http transport', () => {
  it('declares connection local-http and needs no credential', () => {
    const transport = new OllamaLocalHttpTransport()
    expect(transport.connection).toBe('local-http')
    expect(transport.credentialStatus()).toEqual({ required: false, present: true, source: 'none — local HTTP endpoint', authMode: 'none' })
  })

  it('confirms localhost / 127.0.0.1 / ::1 as local, and refuses anything else', () => {
    expect(new OllamaLocalHttpTransport({ baseUrl: 'http://127.0.0.1:11434' }).isLocalEndpoint()).toBe(true)
    expect(new OllamaLocalHttpTransport({ baseUrl: 'http://localhost:11434' }).isLocalEndpoint()).toBe(true)
    expect(new OllamaLocalHttpTransport({ baseUrl: 'http://[::1]:11434' }).isLocalEndpoint()).toBe(true)
    // The exact misconfiguration this check exists for: a "local" adapter quietly pointed at a cloud host.
    expect(new OllamaLocalHttpTransport({ baseUrl: 'https://ollama.cloud-provider.example' }).isLocalEndpoint()).toBe(false)
    expect(new OllamaLocalHttpTransport({ baseUrl: 'http://192.168.1.50:11434' }).isLocalEndpoint()).toBe(false)
    expect(new OllamaLocalHttpTransport({ baseUrl: 'ftp://127.0.0.1:11434' }).isLocalEndpoint()).toBe(false)
    expect(new OllamaLocalHttpTransport({ baseUrl: 'not a url' }).isLocalEndpoint()).toBe(false)
  })

  it('posts to the documented default endpoint and model, with no credential header', async () => {
    process.env.SHOULD_NOT_BE_READ = 'x'
    let seenUrl = ''
    let seenInit: RequestInit | undefined
    const transport = new OllamaLocalHttpTransport({
      fetchImpl: async (input, init) => {
        seenUrl = input
        seenInit = init
        return json({ response: '受信しました。役割: proposal。', done: true })
      }
    })
    const outcome = await transport.send(packet, options)
    expect(seenUrl).toBe(`${defaultOllamaBaseUrl}/api/generate`)
    expect(outcome).toMatchObject({ status: 'success', terminationReason: 'completed' })

    const headers = seenInit?.headers as Record<string, string>
    expect(Object.keys(headers)).not.toContain('authorization')
    expect(Object.keys(headers)).not.toContain('x-api-key')

    const body = JSON.parse(seenInit?.body as string)
    expect(body.model).toBe(defaultOllamaModel)
    expect(body.stream).toBe(false)
    expect(body.prompt).toContain('合成パケット')
    expect(seenInit?.redirect).toBe('error')
    delete process.env.SHOULD_NOT_BE_READ
  })

  it('does not silently follow or swallow a redirect: fetch refusing it (redirect: "error") surfaces as a thrown error, not a success', async () => {
    // What real fetch does when a server responds with a redirect and `redirect: 'error'` is set.
    const redirectRefused: (input: string, init: RequestInit) => Promise<Response> = async (_input, init) => {
      expect(init.redirect).toBe('error')
      const error = new TypeError('fetch failed')
      ;(error as { cause?: unknown }).cause = new Error('unexpected redirect, redirect mode is set to error')
      throw error
    }
    await expect(new OllamaLocalHttpTransport({ fetchImpl: redirectRefused }).send(packet, options)).rejects.toThrow(/fetch failed/)
  })

  it('reports an Ollama-reported error as failed', async () => {
    const { fetchImpl } = stub(() => json({ error: 'model "llama3" not found' }))
    expect(await new OllamaLocalHttpTransport({ fetchImpl }).send(packet, options)).toMatchObject({ status: 'failed', terminationReason: 'ollama-error:model "llama3" not found' })
  })

  it('reports an empty response as invalid', async () => {
    const { fetchImpl } = stub(() => json({ response: '', done: true }))
    expect(await new OllamaLocalHttpTransport({ fetchImpl }).send(packet, options)).toMatchObject({ status: 'invalid', terminationReason: 'no-response-text' })
  })

  it('maps HTTP failures without leaking more than a short error excerpt', async () => {
    for (const [status, expected] of [[429, 'failed'], [500, 'failed'], [503, 'failed'], [400, 'invalid']] as const) {
      const { fetchImpl } = stub(() => new Response('x'.repeat(1000), { status }))
      const outcome = await new OllamaLocalHttpTransport({ fetchImpl }).send(packet, options)
      expect(outcome).toMatchObject({ status: expected, terminationReason: `http-${status}` })
      expect(outcome.errorText?.length).toBeLessThanOrEqual(200)
    }
  })

  /** Never answers; rejects only once the request is aborted, like a real hung local connection. */
  const hangingFetch = (seen: { signal?: AbortSignal }) => async (_input: string, init: RequestInit): Promise<Response> => {
    seen.signal = init.signal as AbortSignal
    return new Promise((_resolve, reject) => {
      seen.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })
  }

  it('reports an elapsed deadline as a timeout', async () => {
    const seen: { signal?: AbortSignal } = {}
    const outcome = await new OllamaLocalHttpTransport({ fetchImpl: hangingFetch(seen) }).send(packet, { timeoutMs: 10 })
    expect(outcome).toMatchObject({ status: 'timeout', terminationReason: 'no answer within 10ms' })
  })

  it('reports an Owner cancel as cancelled, distinct from a timeout', async () => {
    const seen: { signal?: AbortSignal } = {}
    const controller = new AbortController()
    const pending = new OllamaLocalHttpTransport({ fetchImpl: hangingFetch(seen) }).send(packet, { timeoutMs: 60_000, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seen.signal?.aborted).toBe(false)
    controller.abort(new Error('cancelled by Owner'))

    expect(await pending).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the adapter answered' })
    expect(seen.signal?.aborted).toBe(true)
  })

  it('never opens the request when the caller signal is already aborted', async () => {
    const { calls, fetchImpl } = stub(() => json({}))
    const controller = new AbortController()
    controller.abort(new Error('cancelled before dispatch'))

    const outcome = await new OllamaLocalHttpTransport({ fetchImpl }).send(packet, { timeoutMs: 60_000, signal: controller.signal })
    expect(outcome).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the request was sent' })
    expect(calls).toHaveLength(0)
  })

  it('reports connection refused (server stopped) as a thrown error, mapped the same way as any other transport failure', async () => {
    const refused: (input: string, init: RequestInit) => Promise<Response> = async () => {
      const error = new TypeError('fetch failed')
      ;(error as { cause?: unknown }).cause = { code: 'ECONNREFUSED' }
      throw error
    }
    await expect(new OllamaLocalHttpTransport({ fetchImpl: refused }).send(packet, options)).rejects.toThrow(/fetch failed/)
  })
})

describe('ADF-OLLAMA-LIVE-CONNECTION-001 checkOllamaReadiness — read-only /api/tags check', () => {
  it('reports reachable and model-present, matching a bare model name against its :latest tag', async () => {
    const { fetchImpl } = stub(() => json({ models: [{ name: 'llama3:latest', model: 'llama3:latest' }] }))
    const readiness = await checkOllamaReadiness({ fetchImpl })
    expect(readiness).toMatchObject({ reachable: true, modelPresent: true, models: ['llama3:latest'] })
  })

  it('reports the model missing when /api/tags does not list it, without guessing', async () => {
    const { fetchImpl } = stub(() => json({ models: [{ name: 'mistral:latest' }] }))
    const readiness = await checkOllamaReadiness({ fetchImpl, model: 'llama3' })
    expect(readiness).toMatchObject({ reachable: true, modelPresent: false })
    expect(readiness.detail).toContain('llama3')
  })

  it('reports unreachable when the server refuses the connection (Ollama stopped)', async () => {
    const refused: (input: string, init: RequestInit) => Promise<Response> = async () => {
      throw new TypeError('fetch failed')
    }
    const readiness = await checkOllamaReadiness({ fetchImpl: refused })
    expect(readiness).toMatchObject({ reachable: false, modelPresent: false, models: [] })
  })

  it('reports unreachable on a non-200 response, without throwing', async () => {
    const { fetchImpl } = stub(() => new Response('', { status: 500 }))
    const readiness = await checkOllamaReadiness({ fetchImpl })
    expect(readiness).toMatchObject({ reachable: false, modelPresent: false, detail: 'http-500' })
  })

  it('reports reachable but not model-present on a malformed /api/tags body, without throwing', async () => {
    const { fetchImpl } = stub(() => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    const readiness = await checkOllamaReadiness({ fetchImpl })
    expect(readiness).toMatchObject({ reachable: true, modelPresent: false })
  })

  it('never follows a redirect from /api/tags', async () => {
    const { calls, fetchImpl } = stub(() => json({ models: [] }))
    await checkOllamaReadiness({ fetchImpl })
    expect(calls[0]?.redirect).toBe('error')
  })

  it('exposes the same readiness result through the Provider-neutral transport contract', async () => {
    const { calls, fetchImpl } = stub(() => json({ models: [{ name: 'llama3:latest' }] }))
    const result = await new OllamaLocalHttpTransport({ fetchImpl }).checkReadiness()
    expect(result).toEqual({ ready: true, detail: 'model llama3 present' })
    expect(calls).toHaveLength(1)
  })

  it('fails closed through the transport contract when the model is missing', async () => {
    const { fetchImpl } = stub(() => json({ models: [] }))
    await expect(new OllamaLocalHttpTransport({ fetchImpl }).checkReadiness()).resolves.toMatchObject({ ready: false })
  })
})
