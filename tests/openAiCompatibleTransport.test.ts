import { afterEach, describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { MissingCredentialError } from '../src/main/jobLoop/externalTransport'
import { OpenAICompatibleTransport, type OpenAICompatibleTransportOptions } from '../src/main/jobLoop/openAiCompatibleTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-COMPATIBLE-PROVIDER-ADAPTERS-001', threadId: 'th1', jobId: 'job1', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-25T00:00:00.000Z')
const options = { timeoutMs: 1000 }
const envNames = ['DEEPSEEK_API_KEY', 'ZAI_API_KEY', 'DASHSCOPE_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL'] as const
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]))

function stub(handler: (input: string, init: RequestInit) => Response | Promise<Response>): { calls: Array<{ input: string; init: RequestInit }>; fetchImpl: (input: string, init: RequestInit) => Promise<Response> } {
  const calls: Array<{ input: string; init: RequestInit }> = []
  return {
    calls,
    fetchImpl: async (input, init) => {
      calls.push({ input, init })
      return handler(input, init)
    }
  }
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function transport(overrides: Partial<OpenAICompatibleTransportOptions> = {}): OpenAICompatibleTransport {
  return new OpenAICompatibleTransport({
    providerId: 'deepseek',
    baseUrl: 'https://api.example.test/v1',
    model: 'test-model',
    credentialVariable: 'DEEPSEEK_API_KEY',
    ...overrides
  })
}

afterEach(() => {
  for (const name of envNames) {
    const value = originalEnv[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('OpenAI-compatible external transport', () => {
  it('reports credential presence without exposing the value', () => {
    process.env.DEEPSEEK_API_KEY = 'secret-must-not-appear'
    const status = transport().credentialStatus()
    expect(status).toEqual({ required: true, present: true, source: 'environment variable DEEPSEEK_API_KEY', authMode: 'environment-secret' })
    expect(JSON.stringify(status)).not.toContain('secret-must-not-appear')
  })

  it('refuses to send without a credential and never calls fetch', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const { calls, fetchImpl } = stub(() => json({}))
    await expect(transport({ fetchImpl }).send(packet, options)).rejects.toBeInstanceOf(MissingCredentialError)
    expect(calls).toHaveLength(0)
  })

  it('uses the compatible endpoint and sends only bounded synthetic packet content', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-must-stay-in-header'
    const { calls, fetchImpl } = stub(() => json({ choices: [{ message: { content: '受信しました。' } }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } }))
    const outcome = await transport({ fetchImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'success', content: '受信しました。', metrics: { promptTokens: 11, completionTokens: 7, totalTokens: 18 } })
    expect(calls[0]?.input).toBe('https://api.example.test/v1/chat/completions')
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-must-stay-in-header')
    const body = JSON.parse(calls[0]?.init.body as string)
    expect(body).toMatchObject({ model: 'test-model', stream: false, max_tokens: 512, temperature: 0 })
    expect(body.messages[0].content).toContain('合成パケット')
    expect(calls[0]?.init.body as string).not.toContain('secret-must-stay-in-header')
    expect(calls[0]?.init.body as string).not.toContain('/Users/')
  })

  it('supports the OpenRouter endpoint and an explicitly selected fixed free model', async () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-secret-must-stay-in-header'
    process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b:free'
    const { calls, fetchImpl } = stub(() => json({ choices: [{ message: { content: '固定モデルで受信しました。' } }] }))
    const openRouter = new OpenAICompatibleTransport({
      providerId: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL,
      credentialVariable: 'OPENROUTER_API_KEY',
      fetchImpl
    })
    const outcome = await openRouter.send(packet, options)
    expect(outcome).toMatchObject({ status: 'success', content: '固定モデルで受信しました。' })
    expect(calls[0]?.input).toBe('https://openrouter.ai/api/v1/chat/completions')
    const body = JSON.parse(calls[0]?.init.body as string)
    expect(body.model).toBe('openai/gpt-oss-20b:free')
    expect(calls[0]?.init.body as string).not.toContain('openrouter-secret-must-stay-in-header')
  })

  it('accepts a structured content array and maps HTTP failures without leaking long bodies', async () => {
    process.env.DEEPSEEK_API_KEY = 'k'
    const structured = stub(() => json({ choices: [{ message: { content: [{ type: 'text', text: 'part-a' }, { type: 'text', text: 'part-b' }] } }] }))
    expect(await transport({ fetchImpl: structured.fetchImpl }).send(packet, options)).toMatchObject({ status: 'success', content: 'part-apart-b' })

    for (const [status, expected] of [[429, 'failed'], [500, 'failed'], [401, 'failed'], [400, 'invalid']] as const) {
      const { fetchImpl } = stub(() => new Response('x'.repeat(1000), { status }))
      const outcome = await transport({ fetchImpl }).send(packet, options)
      expect(outcome).toMatchObject({ status: expected, terminationReason: `http-${status}` })
      expect(outcome.errorText?.length).toBeLessThanOrEqual(200)
    }
  })

  it('redacts bearer-shaped provider diagnostics', async () => {
    process.env.DEEPSEEK_API_KEY = 'k'
    const { fetchImpl } = stub(() => json({ error: { type: 'auth_error', message: 'Bearer provider-secret must not be recorded' } }))
    const outcome = await transport({ fetchImpl }).send(packet, options)
    expect(outcome).toMatchObject({ status: 'failed', terminationReason: 'provider-error:auth_error', errorText: 'Bearer [redacted] must not be recorded' })
    expect(JSON.stringify(outcome)).not.toContain('provider-secret')
  })

  it('rejects unsafe endpoint configuration before any send', () => {
    expect(() => transport({ baseUrl: 'http://example.test/v1' })).toThrow(/https URL/)
    expect(() => transport({ baseUrl: 'https://user:pass@example.test/v1' })).toThrow(/https URL/)
    expect(() => transport({ baseUrl: 'https://example.test/v1?key=secret' })).toThrow(/https URL/)
  })

  it('reports malformed and empty provider responses as invalid', async () => {
    process.env.DEEPSEEK_API_KEY = 'k'
    const malformed = stub(() => new Response('{', { status: 200 }))
    expect(await transport({ fetchImpl: malformed.fetchImpl }).send(packet, options)).toMatchObject({ status: 'invalid', terminationReason: 'malformed-json-response' })
    const empty = stub(() => json({ choices: [{ message: { content: '' } }] }))
    expect(await transport({ fetchImpl: empty.fetchImpl }).send(packet, options)).toMatchObject({ status: 'invalid', terminationReason: 'no-response-text' })
  })

  it('distinguishes timeout from Owner cancellation', async () => {
    process.env.DEEPSEEK_API_KEY = 'k'
    const hangingFetch = async (_input: string, init: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      ;(init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')))
    })
    expect(await transport({ fetchImpl: hangingFetch }).send(packet, { timeoutMs: 10 })).toMatchObject({ status: 'timeout', terminationReason: 'no answer within 10ms' })

    const controller = new AbortController()
    const pending = transport({ fetchImpl: hangingFetch }).send(packet, { timeoutMs: 60_000, signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort(new Error('Owner stopped the request'))
    expect(await pending).toMatchObject({ status: 'cancelled', terminationReason: 'cancelled before the adapter answered' })
  })
})
