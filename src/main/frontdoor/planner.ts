import type { DecompositionPlanInput, FrontdoorPlanProposal, FrontdoorRequest } from '../../shared/frontdoorTypes'
import { getAdapterProfile } from '../jobLoop/adapterRegistry'
import { hashJson } from '../jobLoop/hash'
import { createDecompositionPlan } from './decomposition'

export interface FrontdoorPlanner {
  readonly plannerId: string
  readonly version: string
  propose(request: FrontdoorRequest): Promise<FrontdoorPlanProposal>
}

function supportedCapabilities(request: FrontdoorRequest): DecompositionPlanInput['nodes'][number]['capabilities'] {
  const capabilities = request.constraints.allowedCapabilities.filter((capability) => capability === 'read' || capability === 'propose')
  if (capabilities.length === 0) throw new Error('deterministic planner requires read or propose capability')
  return capabilities
}

function profileSnapshot(adapterIds: readonly string[]): string {
  return hashJson(adapterIds.map((adapterId) => getAdapterProfile(adapterId)))
}

function assertFakeProfile(adapterId: string, role: 'proposal' | 'critic'): void {
  const profile = getAdapterProfile(adapterId)
  if (profile.status !== 'available' || profile.dataPolicy !== 'local-only' || !profile.roles.includes(role)) {
    throw new Error(`deterministic planner adapter is unavailable for ${role}: ${adapterId}`)
  }
}

export class DeterministicFakePlanner implements FrontdoorPlanner {
  readonly plannerId = 'fake-planner'
  readonly version = 'v1'

  async propose(request: FrontdoorRequest): Promise<FrontdoorPlanProposal> {
    const capabilities = supportedCapabilities(request)
    assertFakeProfile('fake-ai-a', 'proposal')
    const nodes: DecompositionPlanInput['nodes'] = [{
      nodeId: 'proposal',
      objective: request.objective,
      role: 'proposal',
      adapterId: 'fake-ai-a',
      scope: request.scope,
      contextReferences: request.contextReferences,
      acceptance: [request.requestedOutput],
      stopConditions: ['Scope外要求', 'Owner承認なしの実行'],
      capabilities,
      dependsOn: [],
      depth: 1
    }]

    if (request.constraints.maxNodes > 1 && request.constraints.maxDepth > 1) {
      assertFakeProfile('fake-ai-b', 'critic')
      nodes.push({
        nodeId: 'critic',
        objective: `Proposalを検証する: ${request.objective}`,
        role: 'critic',
        adapterId: 'fake-ai-b',
        scope: request.scope,
        contextReferences: request.contextReferences,
        acceptance: ['Proposalの不足・リスク・前提を返す'],
        stopConditions: ['Scope外要求', 'Owner承認なしの実行'],
        capabilities,
        dependsOn: ['proposal'],
        depth: 2
      })
    }

    const plan = createDecompositionPlan(request, {
      planId: `planner-${request.requestId}`,
      requestId: request.requestId,
      version: 1,
      nodes,
      aggregationPolicy: 'stop-on-blocking-question'
    })

    return {
      plannerId: this.plannerId,
      plannerVersion: this.version,
      requestId: request.requestId,
      requestHash: request.inputHash,
      plan,
      assumptions: [
        'Fake AdapterによるProposal／Criticの最小構成',
        '実AI、外部送信、Work Plane操作は行わない',
        'Plan案はOwner確認後にのみ既存Prepareへ渡す'
      ],
      risks: ['Fake PlannerのPlan品質は実AI Plannerの品質を代表しない'],
      registrySnapshotHash: profileSnapshot(nodes.map((node) => node.adapterId)),
      generatedAt: new Date().toISOString()
    }
  }
}
