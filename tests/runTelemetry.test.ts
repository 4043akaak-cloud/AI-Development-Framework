import { describe, expect, it } from 'vitest'
import { buildNodeTelemetry, collectRunTelemetry, summariseRunTelemetry } from '../src/main/frontdoor/runTelemetry'
import type { AdapterRunStatus } from '../src/shared/jobLoopTypes'

/** Exactly what the one real external send in this runtime recorded, Ollama's own field names. */
const ollamaMetrics = {
  totalDurationNs: 29_184_859_000,
  loadDurationNs: 18_967_963_792,
  promptEvalCount: 164,
  promptEvalDurationNs: 2_025_238_000,
  evalCount: 77,
  evalDurationNs: 8_009_688_000
}

const node = { nodeId: 'proposal', role: 'proposal', adapterId: 'ollama-local' }

describe('buildNodeTelemetry', () => {
  it('reads Ollama field names as tokens', () => {
    const telemetry = buildNodeTelemetry({ ...node, call: { metrics: ollamaMetrics, costTier: 'free', provider: 'ollama-local-http' } })
    expect(telemetry.promptTokens).toBe(164)
    expect(telemetry.completionTokens).toBe(77)
    expect(telemetry.totalTokens).toBe(241)
    expect(telemetry.tokensRecorded).toBe(true)
  })

  it('reads OpenAI-compatible field names as the same thing', () => {
    const telemetry = buildNodeTelemetry({
      ...node,
      call: { metrics: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, costTier: 'free', provider: 'openai-compatible' }
    })
    expect(telemetry.totalTokens).toBe(15)
  })

  it("prefers a provider's own total over adding the parts", () => {
    const telemetry = buildNodeTelemetry({ ...node, call: { metrics: { promptTokens: 10, completionTokens: 5, totalTokens: 99 }, costTier: 'free', provider: 'p' } })
    expect(telemetry.totalTokens).toBe(99)
  })

  /** 18.9s of a 29.3s call. "The model is slow" and "the model was not loaded" are different problems. */
  it('separates model load time from the call', () => {
    const telemetry = buildNodeTelemetry({ ...node, call: { metrics: ollamaMetrics, costTier: 'free', provider: 'ollama-local-http' } })
    expect(telemetry.modelLoadMs).toBe(18_968)
  })

  /**
   * The distinction the whole projection turns on: a Fake adapter genuinely takes 0ms, while a
   * queued Node has not been measured. Defaulting the second to 0 would read as the fastest Node.
   */
  it('leaves an unrun Node unmeasured rather than reporting zero', () => {
    const unrun = buildNodeTelemetry({ ...node, adapterId: 'fake-ai-a' })
    expect(unrun.durationMs).toBeUndefined()
    expect(unrun.status).toBeUndefined()

    const instant = buildNodeTelemetry({ ...node, adapterId: 'fake-ai-a', envelope: { durationMs: 0, status: 'success', terminationReason: 'completed' } })
    expect(instant.durationMs).toBe(0)
  })

  it('reports no tokens rather than zero tokens when the provider said nothing', () => {
    const telemetry = buildNodeTelemetry({ ...node, envelope: { durationMs: 5, status: 'success', terminationReason: 'completed' } })
    expect(telemetry.tokensRecorded).toBe(false)
    expect(telemetry.totalTokens).toBeUndefined()
  })

  it('masks a termination reason before it is shown', () => {
    const telemetry = buildNodeTelemetry({ ...node, envelope: { durationMs: 1, status: 'failed', terminationReason: 'provider-error: api_key=hunter2' } })
    expect(telemetry.terminationReason).not.toContain('hunter2')
    expect(telemetry.terminationReason).toContain('<redacted>')
  })
})

describe('summariseRunTelemetry', () => {
  const measured = (nodeId: string, durationMs: number, totalTokens?: number, status: AdapterRunStatus = 'success') =>
    buildNodeTelemetry({
      nodeId,
      role: 'proposal',
      adapterId: 'a',
      envelope: { durationMs, status, terminationReason: 'completed' },
      ...(totalTokens === undefined ? {} : { call: { metrics: { totalTokens }, costTier: 'free', provider: 'p' } })
    })

  it('sums only what was measured', () => {
    const summary = summariseRunTelemetry([measured('a', 100), measured('b', 200), buildNodeTelemetry({ nodeId: 'c', role: 'critic', adapterId: 'a' })])
    expect(summary.nodeCount).toBe(3)
    expect(summary.measuredNodeCount).toBe(2)
    expect(summary.totalDurationMs).toBe(300)
  })

  /** A total over two of five Nodes is not the Run's total, so the count travels with the number. */
  it('reports how many Nodes the token total covers', () => {
    const summary = summariseRunTelemetry([measured('a', 1, 100), measured('b', 1), measured('c', 1, 50)])
    expect(summary.totalTokens).toBe(150)
    expect(summary.tokenReportingNodeCount).toBe(2)
    expect(summary.nodeCount).toBe(3)
  })

  it('counts failures without counting unrun Nodes as failures', () => {
    const summary = summariseRunTelemetry([measured('a', 1, undefined, 'failed'), buildNodeTelemetry({ nodeId: 'b', role: 'critic', adapterId: 'a' })])
    expect(summary.failedNodeCount).toBe(1)
  })
})

describe('collectRunTelemetry', () => {
  it('takes the newest external call when a Node was retried', async () => {
    const summary = await collectRunTelemetry([{ nodeId: 'n', role: 'proposal', adapterId: 'a', threadId: 't', resultRef: 'r' }], {
      envelope: async () => ({ durationMs: 5, status: 'success', terminationReason: 'completed' }),
      calls: async () =>
        [
          { metrics: { totalTokens: 1 }, costTier: 'free', provider: 'first' },
          { metrics: { totalTokens: 2 }, costTier: 'free', provider: 'second' }
        ] as never
    })
    expect(summary.nodes[0]?.provider).toBe('second')
    expect(summary.nodes[0]?.totalTokens).toBe(2)
  })

  it('treats a missing external-call log as normal, not an error', async () => {
    const summary = await collectRunTelemetry([{ nodeId: 'n', role: 'proposal', adapterId: 'fake-ai-a', threadId: 't', resultRef: 'r' }], {
      envelope: async () => ({ durationMs: 0, status: 'success', terminationReason: 'completed' }),
      calls: async () => []
    })
    expect(summary.nodes[0]?.tokensRecorded).toBe(false)
    expect(summary.measuredNodeCount).toBe(1)
  })

  it('handles a Node that has produced no Result yet', async () => {
    const summary = await collectRunTelemetry([{ nodeId: 'n', role: 'proposal', adapterId: 'fake-ai-a' }], {
      envelope: async () => undefined,
      calls: async () => []
    })
    expect(summary.measuredNodeCount).toBe(0)
    expect(summary.nodeCount).toBe(1)
  })
})
