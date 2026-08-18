import { hashJson } from '../jobLoop/hash'
import type { FrontdoorInspection } from '../../shared/frontdoorTypes'
import type { FrontdoorContextCapsule } from '../../shared/contextCapsuleTypes'

const defaultMaxChars = 8_000

function bounded(value: string | undefined, limit: number): string {
  return (value ?? '').slice(0, limit)
}

function buildCandidate(inspection: FrontdoorInspection, maxChars: number, nodeLimit: number, textLimit: number, referenceLimit: number, generatedAt: string): FrontdoorContextCapsule {
  const assignments = inspection.run.nodes.slice(0, nodeLimit).map((record) => ({
    nodeId: record.node.nodeId,
    role: record.node.role,
    adapterId: record.node.adapterId,
    state: record.state,
    ...(record.resultStatus ? { resultStatus: record.resultStatus } : {}),
    ...(record.resultRef ? { resultRef: record.resultRef } : {}),
    ...(record.resultHash ? { resultHash: record.resultHash } : {})
  }))
  const questions = inspection.openQuestions.slice(0, nodeLimit).map((question) => ({
    questionId: question.questionId,
    nodeId: question.nodeId,
    kind: question.kind,
    text: bounded(question.text, textLimit),
    blocking: question.blocking,
    status: question.status
  }))
  const resultRefs = inspection.aggregate?.childResults.flatMap((result) => result.resultRef ? [result.resultRef] : []).slice(0, referenceLimit) ?? []
  const evidenceRefs = inspection.evidenceRefs.slice(0, referenceLimit)
  const base = {
    schemaVersion: 1 as const,
    runId: inspection.run.runId,
    source: {
      requestHash: inspection.run.requestHash,
      planHash: inspection.run.planHash,
      ...(inspection.aggregateHash ? { aggregateHash: inspection.aggregateHash } : {}),
      eventCount: inspection.eventCount
    },
    current: {
      state: inspection.run.state,
      ...(inspection.run.ownerGate ? { ownerGate: inspection.run.ownerGate } : {}),
      nextAction: bounded(inspection.nextAction, textLimit)
    },
    request: {
      requestId: inspection.request.requestId,
      objective: bounded(inspection.request.objective, textLimit),
      projectRef: bounded(inspection.request.projectRef, textLimit),
      requestedOutput: bounded(inspection.request.requestedOutput, textLimit),
      contextReferences: inspection.request.contextReferences.slice(0, referenceLimit)
    },
    assignments,
    questions,
    references: { resultRefs, evidenceRefs }
  }

  const capsuleId = `capsule-${hashJson({ runId: inspection.run.runId, requestHash: inspection.run.requestHash, planHash: inspection.run.planHash, aggregateHash: inspection.aggregateHash ?? null, maxChars }).slice(0, 24)}`
  const withoutBudget = { ...base, capsuleId, generatedAt, compression: { mode: 'deterministic' as const, maxChars, actualChars: 0, omittedNodeCount: Math.max(0, inspection.run.nodes.length - assignments.length), omittedReferenceCount: Math.max(0, inspection.evidenceRefs.length - evidenceRefs.length) } }
  const provisionalLength = JSON.stringify(withoutBudget).length
  const capsule = { ...withoutBudget, compression: { ...withoutBudget.compression, actualChars: provisionalLength } }
  return capsule
}

export function buildFrontdoorContextCapsule(inspection: FrontdoorInspection, options: { maxChars?: number; generatedAt?: string } = {}): FrontdoorContextCapsule {
  const maxChars = Math.max(1_000, Math.min(options.maxChars ?? defaultMaxChars, 32_000))
  const generatedAt = options.generatedAt ?? new Date().toISOString()
  const profiles = [
    { nodes: 24, text: 800, refs: 32 },
    { nodes: 8, text: 320, refs: 16 },
    { nodes: 3, text: 160, refs: 8 },
    { nodes: 1, text: 80, refs: 4 }
  ]
  for (const profile of profiles) {
    const capsule = buildCandidate(inspection, maxChars, profile.nodes, profile.text, profile.refs, generatedAt)
    const actualChars = JSON.stringify(capsule).length
    const finalized = { ...capsule, compression: { ...capsule.compression, actualChars } }
    if (JSON.stringify(finalized).length <= maxChars) return finalized
  }
  const capsule = buildCandidate(inspection, maxChars, 0, 40, 0, generatedAt)
  return { ...capsule, compression: { ...capsule.compression, actualChars: JSON.stringify(capsule).length } }
}
