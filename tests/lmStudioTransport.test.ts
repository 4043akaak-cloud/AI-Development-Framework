import { describe, expect, it } from 'vitest'
import type { SyntheticPacket } from '../src/shared/externalAdapterTypes'
import { checkLocalOpenAiCompatibleReadiness, LocalOpenAICompatibleTransport } from '../src/main/jobLoop/localOpenAiCompatibleTransport'
import { buildSyntheticPacket } from '../src/main/jobLoop/syntheticPacket'

const thread = { taskId: 'ADF-LM-STUDIO-LOCAL-ADAPTER-001', threadId: 'thread-lm', jobId: 'job-lm', turns: [] } as never
const packet: SyntheticPacket = buildSyntheticPacket(thread, 'proposal', 0, '2026-08-27T00:00:00.000Z')

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('LM Studio local OpenAI-compatible transport', () => {
  it('checks /v1/models and does not choose a model automatically', async () => {
    const calls: string[] = []
    const readiness = await checkLocalOpenAiCompatibleReadiness({
      baseUrl: 'http://127.0.0.1:1234',
      model: 'lmstudio-community/qwen2.5-7b-instruct',
      fetchImpl: async (input) => {
        calls.push(input)
        return json({ data: [{ id: 'lmstudio-community/qwen2.5-7b-instruct' }] })
      }
    })
    expect(readiness).toMatchObject({ reachable: true, modelPresent: true, models: ['lmstudio-community/qwen2.5-7b-instruct'] })
    expect(calls).toEqual(['http://127.0.0.1:1234/v1/models'])

    const noModel = await checkLocalOpenAiCompatibleReadiness({
      fetchImpl: async () => json({ data: [{ id: 'some-model' }] })
    })
    expect(noModel).toMatchObject({ reachable: true, modelPresent: false, model: '' })
    expect(noModel.detail).toContain('LM_STUDIO_MODEL')
  })

  it('rejects a non-loopback endpoint before any request', async () => {
    let calls = 0
    const readiness = await checkLocalOpenAiCompatibleReadiness({
      baseUrl: 'https://example.test/v1',
      fetchImpl: async () => {
        calls += 1
        return json({})
      }
    })
    expect(readiness).toMatchObject({ reachable: false, modelPresent: false, baseUrl: '[invalid-local-endpoint]' })
    expect(calls).toBe(0)
    expect(new LocalOpenAICompatibleTransport({ baseUrl: 'https://example.test/v1' }).isLocalEndpoint()).toBe(false)
  })

  it('sends only to the local chat-completions endpoint after a selected model is configured', async () => {
    const calls: Array<{ input: string; init: RequestInit }> = []
    const transport = new LocalOpenAICompatibleTransport({
      providerId: 'lmstudio',
      baseUrl: 'http://127.0.0.1:1234',
      model: 'lmstudio-community/qwen2.5-7b-instruct',
      fetchImpl: async (input, init) => {
        calls.push({ input, init })
        return json({ choices: [{ message: { content: 'LM Studioからの回答' } }], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } })
      }
    })
    const outcome = await transport.send(packet, { timeoutMs: 1000 })
    expect(outcome).toMatchObject({ status: 'success', content: 'LM Studioからの回答', metrics: { promptTokens: 12, completionTokens: 6, totalTokens: 18 } })
    expect(calls[0]?.input).toBe('http://127.0.0.1:1234/v1/chat/completions')
    const body = JSON.parse(calls[0]?.init.body as string)
    expect(body).toMatchObject({ model: 'lmstudio-community/qwen2.5-7b-instruct', stream: false, max_tokens: 512, temperature: 0 })
    expect(body.messages[0].content).toContain('合成パケット')
    expect(calls[0]?.init.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('refuses to send before the Owner has selected a local model', async () => {
    let calls = 0
    const transport = new LocalOpenAICompatibleTransport({
      model: '',
      fetchImpl: async () => {
        calls += 1
        return json({})
      }
    })
    await expect(transport.send(packet, { timeoutMs: 1000 })).rejects.toThrow(/LM_STUDIO_MODEL/)
    expect(calls).toBe(0)
  })

  it('exposes no credential requirement for the default local server', () => {
    expect(new LocalOpenAICompatibleTransport().credentialStatus()).toEqual({ required: false, present: true, source: 'none — local HTTP endpoint', authMode: 'none' })
  })
})
