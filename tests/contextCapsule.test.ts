import { describe, expect, it } from 'vitest'
import { buildFrontdoorContextCapsule } from '../src/main/frontdoor/contextCapsule'
import type { FrontdoorInspection } from '../src/shared/frontdoorTypes'

function inspection(): FrontdoorInspection {
  return {
    run: {
      runId: 'run-capsule-001', requestId: 'request-capsule-001', requestHash: 'a'.repeat(64), planHash: 'b'.repeat(64), state: 'awaiting-owner', ownerGate: 'awaiting-owner:result-review', nodes: Array.from({ length: 20 }, (_, index) => ({ node: { nodeId: `node-${index}`, objective: `objective-${index}`, role: 'proposal', adapterId: 'fake-ai-a', scope: { inScope: [], outOfScope: [] }, contextReferences: [], acceptance: [], stopConditions: [], capabilities: ['read'], dependsOn: [], depth: 1 }, state: 'completed', childTaskId: `task-${index}`, resultStatus: 'success', resultRef: `threads/thread-${index}/results/turn.json`, resultHash: 'c'.repeat(64), questionIds: [], attempt: 1 })), approvalIds: [], openQuestionIds: [], createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z' },
    request: { requestId: 'request-capsule-001', source: 'codex', objective: 'objective', userInput: 'input', projectRef: 'project://adf', constraints: { allowedCapabilities: ['read'], maxNodes: 20, maxDepth: 1, externalSend: false }, requestedOutput: 'answer', contextReferences: ['obsidian://context'], scope: { inScope: [], outOfScope: [] }, state: 'ready-for-decomposition', receivedAt: '2026-08-18T00:00:00.000Z', inputHash: 'd'.repeat(64) },
    plan: { planId: 'plan-capsule-001', requestId: 'request-capsule-001', version: 1, nodes: [], aggregationPolicy: 'collect-all', planHash: 'b'.repeat(64) },
    decisions: [],
    evidenceRefs: ['threads/thread-0/evidence-links.json'],
    openQuestions: [],
    nextAction: 'awaiting-owner:result-review',
    eventCount: 20,
    nodeTargetHashes: {},
    activities: []
  }
}

describe('Frontdoor Context Capsule', () => {
  it('preserves source hashes and stays within the requested budget', () => {
    const capsule = buildFrontdoorContextCapsule(inspection(), { maxChars: 2_000, generatedAt: '2026-08-18T00:00:00.000Z' })
    expect(JSON.stringify(capsule).length).toBeLessThanOrEqual(2_000)
    expect(capsule.compression.mode).toBe('deterministic')
    expect(capsule.source.requestHash).toBe('a'.repeat(64))
    expect(capsule.source.planHash).toBe('b'.repeat(64))
    expect(capsule.references.evidenceRefs).toContain('threads/thread-0/evidence-links.json')
  })

  it('uses a stable capsule identity for the same source and budget', () => {
    const first = buildFrontdoorContextCapsule(inspection(), { maxChars: 8_000, generatedAt: '2026-08-18T00:00:00.000Z' })
    const second = buildFrontdoorContextCapsule(inspection(), { maxChars: 8_000, generatedAt: '2026-08-19T00:00:00.000Z' })
    expect(first.capsuleId).toBe(second.capsuleId)
  })
})
