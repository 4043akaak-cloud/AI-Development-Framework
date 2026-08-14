import { describe, expect, it } from 'vitest'
import type { DecompositionNode, FrontdoorRequestInput } from '../src/shared/frontdoorTypes'
import { createFrontdoorRequest } from '../src/main/frontdoor/intake'
import { createDecompositionPlan } from '../src/main/frontdoor/decomposition'

function requestInput(): FrontdoorRequestInput {
  return {
    requestId: 'frontdoor-request-001',
    source: 'test',
    objective: '設計案を複数AIで比較する',
    userInput: 'ProposalとCriticへ同じ依頼を渡し、結果を集約する',
    projectRef: 'fixture://adf',
    constraints: { allowedCapabilities: ['read', 'propose'], maxNodes: 3, maxDepth: 2, externalSend: false },
    requestedOutput: 'Owner確認用の比較結果',
    contextReferences: ['fixture://goal.md'],
    scope: { inScope: ['proposal', 'critique', 'aggregation'], outOfScope: ['external-send', 'write-canonical', 'commit'] }
  }
}

function node(nodeId: string, dependsOn: string[] = []): DecompositionNode {
  return {
    nodeId,
    objective: `${nodeId}を実行する`,
    role: nodeId === 'critic' ? 'critic' : 'proposal',
    adapterId: nodeId === 'critic' ? 'fake-ai-b' : 'fake-ai-a',
    scope: { inScope: ['proposal', 'critique', 'aggregation'], outOfScope: ['external-send', 'write-canonical', 'commit'] },
    contextReferences: ['fixture://goal.md'],
    acceptance: ['Resultを返す'],
    stopConditions: ['Scope外要求'],
    capabilities: ['read', 'propose'],
    dependsOn,
    depth: dependsOn.length ? 2 : 1
  }
}

describe('Frontdoor contracts', () => {
  it('creates a hash-bound request and decomposition plan', () => {
    const request = createFrontdoorRequest(requestInput(), '2026-08-14T00:00:00.000Z')
    const plan = createDecompositionPlan(request, { planId: 'plan-001', requestId: request.requestId, version: 1, nodes: [node('proposal'), node('critic', ['proposal'])], aggregationPolicy: 'stop-on-blocking-question' })
    expect(request.state).toBe('ready-for-decomposition')
    expect(request.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects a cyclic plan', () => {
    const request = createFrontdoorRequest(requestInput())
    expect(() => createDecompositionPlan(request, { planId: 'plan-cycle', requestId: request.requestId, version: 1, nodes: [node('proposal', ['critic']), node('critic', ['proposal'])], aggregationPolicy: 'collect-all' })).toThrow(/cyclic dependency/)
  })

  it('rejects a child scope or capability outside the parent request', () => {
    const request = createFrontdoorRequest(requestInput())
    const outside = { ...node('proposal'), scope: { inScope: ['secret-area'], outOfScope: ['external-send'] }, capabilities: ['read', 'propose'] as ['read', 'propose'] }
    expect(() => createDecompositionPlan(request, { planId: 'plan-scope', requestId: request.requestId, version: 1, nodes: [outside], aggregationPolicy: 'collect-all' })).toThrow(/scope exceeds parent/)
    const privileged = { ...node('proposal'), capabilities: ['read', 'propose', 'write-canonical'] as never[] }
    expect(() => createDecompositionPlan(request, { planId: 'plan-capability', requestId: request.requestId, version: 1, nodes: [privileged], aggregationPolicy: 'collect-all' })).toThrow(/capability exceeds parent/)
  })

  it('rejects child context outside the parent request', () => {
    const request = createFrontdoorRequest(requestInput())
    const outside = { ...node('proposal'), contextReferences: ['fixture://unapproved.md'] }
    expect(() => createDecompositionPlan(request, { planId: 'plan-context', requestId: request.requestId, version: 1, nodes: [outside], aggregationPolicy: 'collect-all' })).toThrow(/context exceeds parent/)
  })

  it('rejects a declared depth that is smaller than the dependency graph', () => {
    const request = createFrontdoorRequest({ ...requestInput(), constraints: { ...requestInput().constraints, maxDepth: 2 } })
    const root = node('proposal')
    const child = { ...node('critic', ['proposal']), depth: 1 }
    const grandchild = { ...node('aggregation', ['critic']), depth: 1 }
    expect(() => createDecompositionPlan(request, { planId: 'plan-depth', requestId: request.requestId, version: 1, nodes: [root, child, grandchild], aggregationPolicy: 'collect-all' })).toThrow(/depth does not match dependency depth/)
  })
})
