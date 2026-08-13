import { afterEach, describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { AnthropicMessagesTransport, MissingCredentialError, anthropicApiVersion, anthropicMessagesEndpoint, defaultModel } from '../src/main/jobLoop/anthropicTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-EXTERNAL-ADAPTER-001', threadId: 'th1', jobId: 'job1', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-10T00:00:00.000Z')
const options = { timeoutMs: 1000 }

/** Never reaches the network: every call is answered by an injected stub. */
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

const originalKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = originalKey
})

describe('ADF-EXTERNAL-ADAPTER-001 Anthropic transport', () => {
  it('reports authMode as environment-secret, and the credential value never appears in the report', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-appear-in-the-report'
    const status = new AnthropicMessagesTransport().credentialStatus()
    expect(status).toEqual({ required: true, present: true, source: 'environment variable ANTHROPIC_API_KEY', authMode: 'environment-secret' })
    expect(JSON.stringify(status)).not.toContain('sk-ant-should-not-appear-in-the-report')

    delete process.env.ANTHROPIC_API_KEY
    expect(new AnthropicMessagesTransport().credentialStatus()).toEqual({ required: true, present: false, source: 'environment variable ANTHROPIC_API_KEY', authMode: 'environment-secret' })
  })

  it('refuses to send when no credential is present in the environment', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { calls, fetchImpl } = stub(() => json({}))
    await expect(new AnthropicMessagesTransport({ fetchImpl }).send(packet, options)).rejects.toBeInstanceOf(MissingCredentialError)
    expect(calls).toHaveLength(0)
  })

  it('sends only the synthetic packet, with the credential in the header and never in the body', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-should-not-appear-in-body'
    const { calls, fetchImpl } = stub(() => json({ content: [{ type: 'text', text: '受信しました。役割: proposal。' }], stop_reason: 'end_turn' }))

    const outcome = await new AnthropicMessagesTransport({ fetchImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'success', terminationReason: 'completed' })
    expect(outcome.content).toContain('受信しました')

    const [init] = calls
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('test-key-should-not-appear-in-body')
    expect(headers['anthropic-version']).toBe(anthropicApiVersion)

    const body = JSON.parse(init.body as string)
    expect(body.model).toBe(defaultModel)
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.messages).toHaveLength(1)
    expect(init.body as string).not.toContain('test-key-should-not-appear-in-body')
    expect(init.body as string).not.toContain('/Users/')
    expect(body.messages[0].content).toContain('合成パケット')
  })

  it('posts to the documented Messages endpoint', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    let seen = ''
    const transport = new AnthropicMessagesTransport({
      fetchImpl: async (input) => {
        seen = input
        return json({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })
      }
    })
    await transport.send(packet, options)
    expect(seen).toBe(anthropicMessagesEndpoint)
  })

  it('reports a refusal as a failed outcome with its category', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    const { fetchImpl } = stub(() => json({ content: [], stop_reason: 'refusal', stop_details: { category: 'cyber' } }))
    expect(await new AnthropicMessagesTransport({ fetchImpl }).send(packet, options)).toMatchObject({ status: 'failed', terminationReason: 'refusal:cyber' })
  })

  it('maps HTTP failures without leaking more than a short error excerpt', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    for (const [status, expected] of [[429, 'failed'], [529, 'failed'], [401, 'failed'], [400, 'invalid']] as const) {
      const { fetchImpl } = stub(() => new Response('x'.repeat(1000), { status }))
      const outcome = await new AnthropicMessagesTransport({ fetchImpl }).send(packet, options)
      expect(outcome).toMatchObject({ status: expected, terminationReason: `http-${status}` })
      expect(outcome.errorText?.length).toBeLessThanOrEqual(200)
    }
  })

  it('reports an empty answer as invalid and a truncated answer as success', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    const empty = stub(() => json({ content: [], stop_reason: 'end_turn' }))
    expect(await new AnthropicMessagesTransport({ fetchImpl: empty.fetchImpl }).send(packet, options)).toMatchObject({ status: 'invalid' })

    const truncated = stub(() => json({ content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' }))
    expect(await new AnthropicMessagesTransport({ fetchImpl: truncated.fetchImpl }).send(packet, options)).toMatchObject({ status: 'success', terminationReason: 'completed-truncated' })
  })

  /** Never answers; rejects only once the request is aborted, like a real hung connection. */
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
    process.env.ANTHROPIC_API_KEY = 'k'
    const seen: { signal?: AbortSignal } = {}
    const outcome = await new AnthropicMessagesTransport({ fetchImpl: hangingFetch(seen) }).send(packet, { timeoutMs: 10 })
    expect(outcome).toMatchObject({ status: 'timeout', terminationReason: 'no answer within 10ms' })
  })

  it('reports an Owner cancel as cancelled, distinct from a timeout', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    const seen: { signal?: AbortSignal } = {}
    const controller = new AbortController()
    const pending = new AnthropicMessagesTransport({ fetchImpl: hangingFetch(seen) }).send(packet, { timeoutMs: 60_000, signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 10))
    // The caller's signal must reach the real request, not just the transport's own deadline.
    expect(seen.signal?.aborted).toBe(false)
    controller.abort(new Error('cancelled by Owner'))

    expect(await pending).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the adapter answered' })
    expect(seen.signal?.aborted).toBe(true)
  })

  it('never opens the request when the caller signal is already aborted', async () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    const { calls, fetchImpl } = stub(() => json({}))
    const controller = new AbortController()
    controller.abort(new Error('cancelled before dispatch'))

    const outcome = await new AnthropicMessagesTransport({ fetchImpl }).send(packet, { timeoutMs: 60_000, signal: controller.signal })
    expect(outcome).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the request was sent' })
    expect(calls).toHaveLength(0)
  })
})
