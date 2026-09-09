import type { ExternalCallRecord, ExternalPerformanceMetrics } from '../../shared/externalAdapterTypes'
import type { NodeTelemetry, RunTelemetry } from '../../shared/frontdoorTypes'
import type { AdapterResultEnvelope } from '../jobLoop/resultEnvelope'
import { maskSecrets } from '../../shared/secretSentinel'

/**
 * What a Run cost, assembled from measurements ADF already records but never showed anyone.
 *
 * The Blueprint defers "token, latency, cost, and quality measurement" to a later step. That was
 * written when none of it was measured. Since then every transport returns `durationMs` and a
 * provider's own counters, and `ExternalCallRecord` persists them — but nothing under
 * `src/main/frontdoor/` reads the word `metrics`. The numbers are recorded and unreadable.
 *
 * Derived on every read from the Result Envelopes and the external-call log, like activityTrace and
 * goalAlignment. It adds no measurement of its own and asks no provider for anything.
 */

/**
 * Providers disagree about what a token count is called. Ollama reports `promptEvalCount` and
 * `evalCount`; OpenAI-compatible endpoints report `promptTokens` and `completionTokens`. Both are
 * "tokens in, tokens out", so they are normalised here rather than in every reader.
 */
function normaliseTokens(metrics: ExternalPerformanceMetrics | undefined): Pick<NodeTelemetry, 'promptTokens' | 'completionTokens' | 'totalTokens'> {
  if (!metrics) return {}
  const promptTokens = metrics.promptTokens ?? metrics.promptEvalCount
  const completionTokens = metrics.completionTokens ?? metrics.evalCount
  const totalTokens =
    metrics.totalTokens ?? (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined)
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {})
  }
}

const NS_PER_MS = 1_000_000

/**
 * Ollama reports how long the model spent being loaded rather than answering. On the one real
 * external send in this runtime that was 18.9s of a 29.3s call — the difference between "the model
 * is slow" and "the model was not resident", which are not the same problem.
 */
function loadDurationMs(metrics: ExternalPerformanceMetrics | undefined): number | undefined {
  return metrics?.loadDurationNs === undefined ? undefined : Math.round(metrics.loadDurationNs / NS_PER_MS)
}

/** Only the fields telemetry reads. Declaring the whole Envelope would overstate what it needs. */
export type MeasuredResult = Pick<AdapterResultEnvelope, 'durationMs' | 'status' | 'terminationReason'>

export interface NodeTelemetryInput {
  nodeId: string
  role: string
  adapterId: string
  /** Absent while the Node has not run. */
  envelope?: MeasuredResult
  /** Absent for local and Fake adapters, which make no external call. */
  call?: Pick<ExternalCallRecord, 'metrics' | 'costTier' | 'provider' | 'durationMs'>
  /** The Node's own state, which is set even when it failed before producing a Result. */
  nodeState?: string
}

export function buildNodeTelemetry(input: NodeTelemetryInput): NodeTelemetry {
  const tokens = normaliseTokens(input.call?.metrics)
  const modelLoadMs = loadDurationMs(input.call?.metrics)
  const measuredDurationMs = input.call?.durationMs ?? (input.envelope ? input.envelope.durationMs : undefined)
  return {
    nodeId: input.nodeId,
    role: input.role,
    adapterId: input.adapterId,
    // The Envelope's own durationMs is hard-coded to 0 by relay.ts when the Turn is built, so a
    // 29-second call reported as instant. The external-call record is where the measurement is.
    // Left undefined when neither has it: an unmeasured Node must not read as an instant one.
    ...(measuredDurationMs !== undefined ? { durationMs: measuredDurationMs } : {}),
    ...(input.envelope ? { status: input.envelope.status } : {}),
    ...(input.nodeState && !input.envelope ? { status: input.nodeState } : {}),
    ...(input.envelope?.terminationReason ? { terminationReason: maskSecrets(input.envelope.terminationReason) } : {}),
    ...(input.call ? { provider: input.call.provider, costTier: input.call.costTier } : {}),
    ...(modelLoadMs !== undefined ? { modelLoadMs } : {}),
    ...tokens,
    tokensRecorded: tokens.totalTokens !== undefined
  }
}

export function summariseRunTelemetry(nodes: readonly NodeTelemetry[]): RunTelemetry {
  const measured = nodes.filter((node) => node.durationMs !== undefined)
  const withTokens = nodes.filter((node) => node.tokensRecorded)
  return {
    nodes: [...nodes],
    nodeCount: nodes.length,
    measuredNodeCount: measured.length,
    totalDurationMs: measured.reduce((total, node) => total + (node.durationMs ?? 0), 0),
    // Summed only across Nodes that reported tokens, so a partial total is never read as a whole one.
    totalTokens: withTokens.reduce((total, node) => total + (node.totalTokens ?? 0), 0),
    tokenReportingNodeCount: withTokens.length,
    // Counts a Node that failed before any Envelope existed — a readiness or transport failure
    // leaves `node.state === 'failed'` and no Result, which used to read as simply not run.
    failedNodeCount: nodes.filter((node) => node.status !== undefined && node.status !== 'success').length
  }
}

/**
 * Reads the per-Node measurements off disk.
 *
 * Every Node has a Result Envelope carrying `durationMs`; only Nodes that made an external call
 * also have an entry in that thread's `external-calls.jsonl`, which is where token counts live.
 * A missing file is not an error — Fake and local adapters never write one.
 */
export async function collectRunTelemetry(
  nodes: readonly { nodeId: string; role: string; adapterId: string; threadId?: string; resultRef?: string; nodeState?: string }[],
  read: { envelope: (resultRef: string) => Promise<MeasuredResult | undefined>; calls: (threadId: string) => Promise<ExternalCallRecord[]> }
): Promise<RunTelemetry> {
  const collected: NodeTelemetry[] = []
  for (const node of nodes) {
    const envelope = node.resultRef ? await read.envelope(node.resultRef) : undefined
    // The newest call for the thread: a retried Node has more than one, and the last is the one
    // whose Result was kept.
    const call = node.threadId ? (await read.calls(node.threadId)).at(-1) : undefined
    collected.push(
      buildNodeTelemetry({
        nodeId: node.nodeId,
        role: node.role,
        adapterId: node.adapterId,
        ...(node.nodeState ? { nodeState: node.nodeState } : {}),
        envelope,
        call
      })
    )
  }
  return summariseRunTelemetry(collected)
}
