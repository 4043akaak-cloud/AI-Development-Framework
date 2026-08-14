import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FrontdoorEventType, FrontdoorLedgerEvent, OwnerDecisionEnvelope, OrchestrationRun } from '../../shared/frontdoorTypes'
import { ensureDir } from '../jobLoop/ledger'
import { hashJson } from '../jobLoop/hash'

export const frontdoorGenesisHash = 'frontdoor-ledger-genesis-v1'

export function frontdoorEventsPath(runtimeRoot: string, runId: string): string {
  return path.join(runtimeRoot, 'frontdoor-runs', runId, 'events.jsonl')
}

function eventHash(event: Omit<FrontdoorLedgerEvent, 'eventHash'>): string {
  return hashJson(event)
}

export async function readFrontdoorEvents(runtimeRoot: string, runId: string): Promise<FrontdoorLedgerEvent[]> {
  try {
    const text = await readFile(frontdoorEventsPath(runtimeRoot, runId), 'utf8')
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as FrontdoorLedgerEvent)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export function validateFrontdoorEventChain(events: readonly FrontdoorLedgerEvent[], expectedRunId?: string): void {
  let previous = frontdoorGenesisHash
  events.forEach((event, index) => {
    if (event.schemaVersion !== 1) throw new Error(`unsupported Frontdoor event schema at sequence ${event.sequence}`)
    if (event.sequence !== index) throw new Error(`Frontdoor event sequence gap at ${event.sequence}`)
    if (!event.eventId || !event.type || !event.occurredAt || !event.payload || typeof event.payload !== 'object') throw new Error(`Frontdoor event envelope is incomplete at sequence ${event.sequence}`)
    if (index === 0 && event.type !== 'frontdoor.run-created') throw new Error('Frontdoor Ledger must begin with run-created')
    if (index > 0 && event.type === 'frontdoor.run-created') throw new Error('Frontdoor Ledger contains a duplicate run-created event')
    if (expectedRunId && event.runId !== expectedRunId) throw new Error(`Frontdoor event runId mismatch at ${event.sequence}`)
    if (event.previousEventHash !== previous) throw new Error(`Frontdoor event previous hash mismatch at ${event.sequence}`)
    const { eventHash: storedHash, ...withoutHash } = event
    if (eventHash(withoutHash) !== storedHash) throw new Error(`Frontdoor event hash mismatch at ${event.sequence}`)
    previous = storedHash
  })
}

export async function appendFrontdoorEvent(runtimeRoot: string, runId: string, type: FrontdoorEventType, payload: Record<string, unknown>, occurredAt = new Date().toISOString()): Promise<FrontdoorLedgerEvent> {
  const events = await readFrontdoorEvents(runtimeRoot, runId)
  validateFrontdoorEventChain(events, runId)
  const previousEventHash = events.at(-1)?.eventHash ?? frontdoorGenesisHash
  const sequence = events.length
  const base = {
    schemaVersion: 1 as const,
    sequence,
    eventId: `frontdoor-event-${hashJson([runId, sequence, type, payload, occurredAt]).slice(0, 20)}`,
    runId,
    occurredAt,
    previousEventHash,
    type,
    payload
  }
  const event = { ...base, eventHash: eventHash(base) }
  await ensureDir(path.dirname(frontdoorEventsPath(runtimeRoot, runId)))
  await writeFile(frontdoorEventsPath(runtimeRoot, runId), `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' })
  return event
}

export function replayFrontdoorRun(events: readonly FrontdoorLedgerEvent[]): OrchestrationRun {
  validateFrontdoorEventChain(events)
  const created = events.find((event) => event.type === 'frontdoor.run-created')
  const initial = created?.payload.snapshot
  if (!initial || typeof initial !== 'object') throw new Error('Frontdoor Ledger has no run-created snapshot')
  let run = structuredClone(initial) as OrchestrationRun
  const decisions = new Map<string, OwnerDecisionEnvelope>()
  for (const event of events.slice((created?.sequence ?? 0) + 1)) {
    const payload = event.payload
    const nodeId = typeof payload.nodeId === 'string' ? payload.nodeId : undefined
    const currentNode = nodeId ? run.nodes.find((node) => node.node.nodeId === nodeId) : undefined
    if (event.type === 'frontdoor.approval-bound' && run.state !== 'ready-for-approval') throw new Error('Frontdoor approval-bound event has an invalid prior state')
    if (event.type === 'frontdoor.completion-proposed' && !['awaiting-owner', 'blocked-by-question'].includes(run.state)) throw new Error('Frontdoor completion-proposed event has an invalid prior state')
    if (event.type === 'frontdoor.completion-approved' && run.state !== 'awaiting-owner') throw new Error('Frontdoor completion-approved event has an invalid prior state')
    if (event.type === 'frontdoor.owner-decision-recorded') {
      const decision = payload.decision as OwnerDecisionEnvelope | undefined
      if (!decision || decision.runId !== event.runId || !decision.requestId || !decision.decisionId || !decision.approvedBy || !/^[a-f0-9]{64}$/.test(decision.targetHash)) throw new Error('Frontdoor Owner Decision envelope is invalid')
      if (decisions.has(decision.decisionId)) throw new Error('Frontdoor Owner Decision is duplicated')
      decisions.set(decision.decisionId, decision)
    }
    if (event.type === 'frontdoor.node-approved') {
      const decisionId = typeof payload.decisionId === 'string' ? payload.decisionId : ''
      const decision = decisions.get(decisionId)
      if (!decision || decision.gate !== 'dispatch' || decision.targetHash !== payload.targetHash || typeof payload.nodeId !== 'string' || typeof payload.nodeTargetHash !== 'string') throw new Error('Frontdoor Node approval is not bound to a valid dispatch Decision')
    }
    if (event.type === 'frontdoor.question-answered' || event.type === 'frontdoor.result-reviewed' || event.type === 'frontdoor.completion-approved') {
      const decision = event.type === 'frontdoor.result-reviewed' || event.type === 'frontdoor.completion-approved'
        ? payload.decision as OwnerDecisionEnvelope | undefined
        : decisions.get(String(payload.decisionId))
      const expectedGate = event.type === 'frontdoor.question-answered' ? 'question' : event.type === 'frontdoor.result-reviewed' ? 'result-review' : 'completion'
      if (!decision || decision.runId !== event.runId || decision.gate !== expectedGate || !decisions.has(decision.decisionId)) throw new Error(`Frontdoor ${event.type} is not bound to an Owner Decision`)
    }
    if (event.type === 'frontdoor.node-started' && (run.state !== 'running' || !currentNode || !['queued', 'ready', 'recovery-needed'].includes(currentNode.state))) throw new Error('Frontdoor node-started event has an invalid prior state')
    if ((event.type === 'frontdoor.node-completed' || event.type === 'frontdoor.node-failed') && nodeId && nodeId !== 'dependency-resolution' && (!currentNode || currentNode.state !== 'running')) throw new Error('Frontdoor node completion event has an invalid prior state')
    if (event.type === 'frontdoor.run-recovery-needed' && !['running', 'awaiting-owner'].includes(run.state)) throw new Error('Frontdoor recovery event has an invalid prior state')
    if (event.type === 'frontdoor.run-completed' && ['ready-for-approval', 'complete', 'partial', 'failed', 'cancelled'].includes(run.state)) throw new Error('Frontdoor completion event has an invalid prior state')
    const nodeRecords = Array.isArray(payload.nodeRecords) ? payload.nodeRecords : payload.nodeRecord ? [payload.nodeRecord] : []
    for (const record of nodeRecords) {
      if (record && typeof record === 'object' && 'node' in record && typeof (record as { node?: unknown }).node === 'object') {
        const recordNodeId = (record as { node: { nodeId?: unknown } }).node.nodeId
        if (typeof recordNodeId === 'string') run = updateNode(run, recordNodeId, () => structuredClone(record) as OrchestrationRun['nodes'][number])
      }
    }
    if (event.type === 'frontdoor.approval-bound') run = { ...run, state: 'running', ownerGate: 'running', approvalIds: Array.isArray(payload.approvalIds) ? payload.approvalIds as string[] : run.approvalIds }
    if (event.type === 'frontdoor.owner-gate-opened' && typeof payload.gate === 'string') run = { ...run, ownerGate: `awaiting-owner:${payload.gate}` as OrchestrationRun['ownerGate'] }
    if (event.type === 'frontdoor.node-started' && nodeId) run = updateNode(run, nodeId, (node) => ({ ...node, state: 'running', attempt: typeof payload.attempt === 'number' ? payload.attempt : node.attempt + 1 }))
    if (event.type === 'frontdoor.run-recovery-needed') run = { ...run, state: 'awaiting-owner', ownerGate: 'awaiting-owner:dispatch' }
    if (event.type === 'frontdoor.question-opened') run = { ...run, state: 'awaiting-owner', ownerGate: 'awaiting-owner:question', openQuestionIds: Array.isArray(payload.questionIds) ? payload.questionIds as string[] : run.openQuestionIds }
    if (event.type === 'frontdoor.completion-proposed') run = { ...run, state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review', aggregateResultRef: typeof payload.aggregateRef === 'string' ? payload.aggregateRef : run.aggregateResultRef }
    if (event.type === 'frontdoor.result-reviewed' && (payload.decision as { decision?: unknown } | undefined)?.decision === 'accept') run = { ...run, ownerGate: 'awaiting-owner:completion' }
    if (event.type === 'frontdoor.run-stopped') run = { ...run, state: 'cancelled', ownerGate: 'stopped' }
    if (event.type === 'frontdoor.run-completed') run = { ...run, state: payload.status as OrchestrationRun['state'], ownerGate: payload.status === 'complete' ? 'completed' : run.ownerGate, aggregateResultRef: typeof payload.aggregateRef === 'string' ? payload.aggregateRef : run.aggregateResultRef, openQuestionIds: Array.isArray(payload.openQuestionIds) ? payload.openQuestionIds as string[] : run.openQuestionIds }
    if (typeof payload.runState === 'string') run = { ...run, state: payload.runState as OrchestrationRun['state'] }
  }
  return run
}

function updateNode(run: OrchestrationRun, nodeId: string, update: (node: OrchestrationRun['nodes'][number]) => OrchestrationRun['nodes'][number]): OrchestrationRun {
  return { ...run, nodes: run.nodes.map((node) => node.node.nodeId === nodeId ? update(node) : node) }
}
