import { readJson } from './ledger'
import { hashJson } from './hash'
import type { ConversationThread, ConversationTurn } from '../../shared/threadTypes'
import type { LiveArtifactInspection, LiveEvidenceArtifact, LiveResultArtifact } from '../../shared/liveArtifactTypes'
import type { AdapterResultEnvelope } from './resultEnvelope'
import { validateResultEnvelope } from './resultEnvelope'
import { safeRuntimePath } from '../frontdoor/pathIntegrity'

const MAX_CONTENT_LENGTH = 12_000

function boundedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.length > MAX_CONTENT_LENGTH ? `${value.slice(0, MAX_CONTENT_LENGTH)}\n…（表示上限により省略）` : value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '成果物を検証できませんでした'
}

async function inspectResult(runtimeRoot: string, thread: ConversationThread, turn: ConversationTurn): Promise<LiveResultArtifact> {
  const reference = turn.resultEnvelopeRef!
  const base = {
    turnId: turn.turnId,
    adapterId: turn.adapterId,
    role: turn.role,
    status: turn.status,
    reference,
    createdAt: turn.createdAt
  }
  try {
    const envelopePath = await safeRuntimePath(runtimeRoot, reference)
    const envelope = await readJson<AdapterResultEnvelope>(envelopePath)
    validateResultEnvelope(envelope, { taskId: thread.taskId, jobId: thread.jobId, inputHash: thread.inputHash })
    const actualHash = hashJson(envelope)
    if (!turn.resultEnvelopeHash) throw new Error('Result Envelope hash is missing')
    if (turn.resultEnvelopeHash !== actualHash) throw new Error('Result Envelope hash mismatch')
    return {
      ...base,
      artifactStatus: 'available',
      hash: actualHash,
      summary: boundedText(envelope.summary),
      content: boundedText(envelope.content),
      verification: envelope.verification,
      risks: envelope.risks
    }
  } catch (error) {
    return { ...base, artifactStatus: 'broken', issue: errorMessage(error) }
  }
}

async function inspectEvidence(runtimeRoot: string, thread: ConversationThread): Promise<LiveEvidenceArtifact> {
  const reference = `threads/${thread.threadId}/evidence-links.json`
  try {
    const evidencePath = await safeRuntimePath(runtimeRoot, reference)
    const evidence = await readJson<{ threadId?: string; taskId?: string; jobId?: string; turns?: unknown[] }>(evidencePath)
    if (evidence.threadId !== thread.threadId || evidence.taskId !== thread.taskId || evidence.jobId !== thread.jobId) throw new Error('Evidence binding mismatch')
    if (!Array.isArray(evidence.turns)) throw new Error('Evidence turns are invalid')
    const expectedTurns = new Map(thread.turns.filter((turn) => Boolean(turn.resultEnvelopeRef)).map((turn) => [turn.turnId, turn]))
    const seenTurnIds = new Set<string>()
    for (const entry of evidence.turns) {
      if (!entry || typeof entry !== 'object') throw new Error('Evidence turn entry is invalid')
      const evidenceTurn = entry as { turnId?: unknown; resultEnvelopeRef?: unknown; resultEnvelopeHash?: unknown }
      if (typeof evidenceTurn.turnId !== 'string' || typeof evidenceTurn.resultEnvelopeRef !== 'string') throw new Error('Evidence turn binding is invalid')
      const expected = expectedTurns.get(evidenceTurn.turnId)
      if (!expected || expected.resultEnvelopeRef !== evidenceTurn.resultEnvelopeRef) throw new Error('Evidence turn reference mismatch')
      if (seenTurnIds.has(evidenceTurn.turnId)) throw new Error('Evidence contains a duplicate Thread turn')
      if (typeof expected.resultEnvelopeHash !== 'string' || typeof evidenceTurn.resultEnvelopeHash !== 'string') throw new Error('Evidence turn hash is missing')
      if (expected.resultEnvelopeHash !== evidenceTurn.resultEnvelopeHash) throw new Error('Evidence turn hash mismatch')
      seenTurnIds.add(evidenceTurn.turnId)
    }
    if (seenTurnIds.size !== expectedTurns.size) throw new Error('Evidence is missing a Thread turn')
    return { artifactStatus: 'available', reference, hash: hashJson(evidence), turnCount: evidence.turns.length }
  } catch (error) {
    return { artifactStatus: 'broken', reference, turnCount: 0, issue: errorMessage(error) }
  }
}

export async function inspectThreadArtifacts(runtimeRoot: string, thread: ConversationThread): Promise<LiveArtifactInspection> {
  if (thread.state !== 'completed') throw new Error(`Live artifacts are available only for completed Threads: ${thread.state}`)
  const results = await Promise.all(thread.turns.filter((turn) => Boolean(turn.resultEnvelopeRef)).map((turn) => inspectResult(runtimeRoot, thread, turn)))
  return {
    threadId: thread.threadId,
    taskId: thread.taskId,
    jobId: thread.jobId,
    threadState: thread.state,
    results,
    evidence: await inspectEvidence(runtimeRoot, thread),
    workPlane: {
      artifactStatus: 'not-applicable',
      note: '通常のConversation ThreadにはWork Plane Exportはありません。FrontdoorのExport済みArtifactは別のOwner Gate経路で確認します。'
    }
  }
}
