import type { DecompositionNode, DecompositionPlan, DecompositionPlanInput, FrontdoorRequest } from '../../shared/frontdoorTypes'
import { hashJson } from '../jobLoop/hash'

export class DecompositionRejectedError extends Error {
  readonly code = 'DECOMPOSITION_REJECTED'
  readonly details: string[]

  constructor(details: string[]) {
    super(`Decomposition rejected: ${details.join('; ')}`)
    this.details = details
  }
}

function subset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((value) => allowed.includes(value))
}

function capabilitiesSubset(node: DecompositionNode, request: FrontdoorRequest): boolean {
  return node.capabilities.every((capability) => request.constraints.allowedCapabilities.includes(capability))
}

function validateNode(node: DecompositionNode, request: FrontdoorRequest, ids: Set<string>): string[] {
  const errors: string[] = []
  if (!node.nodeId) errors.push('nodeId is required')
  if (ids.has(node.nodeId)) errors.push(`duplicate nodeId: ${node.nodeId}`)
  if (!node.objective.trim()) errors.push(`node objective is required: ${node.nodeId}`)
  if (!node.adapterId || !node.role) errors.push(`node adapter and role are required: ${node.nodeId}`)
  if (!subset(node.scope.inScope, request.scope.inScope)) errors.push(`node scope exceeds parent scope: ${node.nodeId}`)
  if (!subset(node.contextReferences, request.contextReferences)) errors.push(`node context exceeds parent context: ${node.nodeId}`)
  if (!request.scope.outOfScope.every((item) => node.scope.outOfScope.includes(item))) errors.push(`node removes a parent out-of-scope boundary: ${node.nodeId}`)
  if (!capabilitiesSubset(node, request)) errors.push(`node capability exceeds parent grant: ${node.nodeId}`)
  if (node.depth < 1 || node.depth > request.constraints.maxDepth) errors.push(`node depth is outside the approved limit: ${node.nodeId}`)
  return errors
}

function assertAcyclic(nodes: readonly DecompositionNode[]): void {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new DecompositionRejectedError([`cyclic dependency detected at ${nodeId}`])
    if (visited.has(nodeId)) return
    const node = byId.get(nodeId)
    if (!node) throw new DecompositionRejectedError([`dependency references unknown node: ${nodeId}`])
    visiting.add(nodeId)
    node.dependsOn.forEach(visit)
    visiting.delete(nodeId)
    visited.add(nodeId)
  }
  nodes.forEach((node) => visit(node.nodeId))
}

function computedDepths(nodes: readonly DecompositionNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const memo = new Map<string, number>()
  const depthOf = (nodeId: string): number => {
    const cached = memo.get(nodeId)
    if (cached) return cached
    const node = byId.get(nodeId)
    if (!node) throw new DecompositionRejectedError([`dependency references unknown node: ${nodeId}`])
    const depth = node.dependsOn.length === 0 ? 1 : Math.max(...node.dependsOn.map((dependency) => depthOf(dependency))) + 1
    memo.set(nodeId, depth)
    return depth
  }
  nodes.forEach((node) => depthOf(node.nodeId))
  return memo
}

export function validateDecompositionPlan(request: FrontdoorRequest, plan: DecompositionPlanInput): void {
  const errors: string[] = []
  if (plan.requestId !== request.requestId) errors.push('plan requestId mismatch')
  if (!Number.isInteger(plan.version) || plan.version < 1) errors.push('plan version is invalid')
  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0) errors.push('plan must contain at least one node')
  if (plan.nodes.length > request.constraints.maxNodes) errors.push('plan exceeds maxNodes')
  const ids = new Set<string>()
  for (const node of plan.nodes) errors.push(...validateNode(node, request, ids)), ids.add(node.nodeId)
  if (errors.length) throw new DecompositionRejectedError(errors)
  assertAcyclic(plan.nodes)
  const depths = computedDepths(plan.nodes)
  const depthErrors = plan.nodes.filter((node) => node.depth !== depths.get(node.nodeId)).map((node) => `node depth does not match dependency depth: ${node.nodeId}`)
  if (depthErrors.length) throw new DecompositionRejectedError(depthErrors)
}

export function createDecompositionPlan(request: FrontdoorRequest, input: DecompositionPlanInput): DecompositionPlan {
  validateDecompositionPlan(request, input)
  return { ...input, planHash: hashJson(input) }
}

export function readyNodeIds(runNodes: readonly { node: DecompositionNode; state: string }[]): string[] {
  const completed = new Set(runNodes.filter((record) => record.state === 'completed').map((record) => record.node.nodeId))
  return runNodes.filter((record) => record.state === 'queued' && record.node.dependsOn.every((dependency) => completed.has(dependency))).map((record) => record.node.nodeId)
}
