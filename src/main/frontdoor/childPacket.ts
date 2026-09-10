import type { ApprovedTaskPacket, Capability } from '../../shared/jobLoopTypes'
import type { DecompositionNode, DecompositionPlan, FrontdoorRequest, OrchestrationRun } from '../../shared/frontdoorTypes'
import { buildExplicitAdapterPlan } from '../jobLoop/adapterRegistry'
import { validateApprovedTask } from '../jobLoop/contracts'
import { hashJson } from '../jobLoop/hash'

/**
 * The part of a child Packet ADF must not invent.
 *
 * Everything else in the Packet restates the Plan the Owner already approved at the Decomposition
 * Gate, so deriving it adds no authority — it only removes transcription. The authorisation itself
 * does not exist anywhere in the Plan, so it is asked for, never defaulted: who is approving, under
 * which recorded approval, and for how long.
 */
export interface ChildPacketApproval {
  approvalId: string
  approvedBy: string
  approvedAt: string
  expiresAt: string
}

export class ChildPacketDerivationError extends Error {
  readonly code = 'CHILD_PACKET_DERIVATION_FAILED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`Child Packet derivation failed: ${details.join('; ')}`)
    this.details = details
  }
}

/** Mirrors `childTaskId` in orchestrator.ts, which is what `assertPacketMatchesNode` compares against. */
export function childPacketTaskId(requestId: string, nodeId: string): string {
  return `${requestId}::${nodeId}`
}

/**
 * `assertPacketMatchesNode` reads context back as `[githubTask, ...obsidianContext]` and requires
 * that list to cover the Node's references and stay inside the Request's. Splitting head from tail
 * reproduces exactly that list, so the derived Packet satisfies both directions by construction
 * rather than by luck.
 */
function packetContext(node: DecompositionNode, request: FrontdoorRequest): ApprovedTaskPacket['context'] {
  const [githubTask, ...obsidianContext] = node.contextReferences
  return {
    githubTask,
    obsidianContext,
    // Recorded so the Packet says which boundaries it was issued under. These are the boundaries
    // ADF enforces for every Frontdoor child regardless of what the Node asked for.
    adoptedPrinciples: ['owner-approval', 'local-only', 'no-external-send', `frontdoor-request:${request.requestId}`]
  }
}

/**
 * A Frontdoor child proposes; it does not write. `allowedFiles` is therefore empty rather than
 * hopeful: a Node that needs to change files goes through the Work Plane export, which carries its
 * own Owner Gate. The Request's own out-of-scope list is carried into `forbiddenChanges` so the
 * Packet states the Owner's stated boundary and not only ADF's fixed one.
 */
function packetTarget(request: FrontdoorRequest, run: OrchestrationRun, node: DecompositionNode): ApprovedTaskPacket['target'] {
  const fixed = ['external-send', 'write-canonical', 'commit', 'push', 'merge']
  return {
    repository: request.projectRef,
    branch: `frontdoor/${run.runId}`,
    worktree: `frontdoor://${run.runId}`,
    allowedFiles: [],
    // The Node's own out-of-scope list is carried too, not just the Request's. A Node may narrow
    // the Request further, and dropping that would issue a Packet stating a wider boundary than the
    // Decomposition the Owner approved.
    forbiddenChanges: [...new Set([...fixed, ...request.scope.outOfScope, ...node.scope.outOfScope])]
  }
}

function deriveOne(request: FrontdoorRequest, run: OrchestrationRun, node: DecompositionNode, approval: ChildPacketApproval): ApprovedTaskPacket {
  const taskId = childPacketTaskId(request.requestId, node.nodeId)
  const scopeHash = hashJson(node.scope)
  const context = packetContext(node, request)
  // Throws when the Node names an adapter that is unavailable, non-local, or wrong for the role.
  // Failing here is the point: a Packet that could never legally execute must not reach the Owner
  // as something to approve.
  const adapterPlan = buildExplicitAdapterPlan(taskId, node.adapterId, node.role, node.capabilities)
  return {
    taskId,
    objective: node.objective,
    scope: node.scope,
    scopeHash,
    context,
    contextHash: hashJson(context),
    acceptance: node.acceptance,
    stopConditions: node.stopConditions,
    approval: {
      approvalId: approval.approvalId,
      taskId,
      status: 'active',
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      expiresAt: approval.expiresAt,
      scopeHash,
      routingPlanHash: hashJson(adapterPlan),
      // The Node's own capabilities, never a superset. Widening here would grant the child more
      // than the Decomposition the Owner approved.
      capabilities: node.capabilities as Capability[]
    },
    adapter: 'frontdoor-child',
    fixtureMode: 'success',
    target: packetTarget(request, run, node),
    adapterPlan,
    frontdoorBinding: { runId: run.runId, requestHash: run.requestHash, planHash: run.planHash, nodeId: node.nodeId },
    ...(run.runKind === 'implementation' && run.implementationBinding ? { implementationBinding: run.implementationBinding } : {})
  }
}

/**
 * Derives the child Packet for every Node in the approved Plan.
 *
 * Before this existed the Owner had to leave ADF at the Dispatch Gate, hand-author one JSON file
 * per Node with four hashes computed by hand, and come back. That is transcription, not judgement:
 * every field except the approval envelope is a restatement of the Plan already approved one Gate
 * earlier, and a mistyped hash simply produced a rejected Packet rather than a different decision.
 *
 * Authority is unchanged. The Owner still approves the Dispatch afterwards, and that Decision's
 * target hash binds the exact bytes of these Packets — so the Owner approves what was generated,
 * not the intent to generate something.
 */
export function deriveChildPackets(request: FrontdoorRequest, run: OrchestrationRun, plan: DecompositionPlan, approval: ChildPacketApproval): Record<string, ApprovedTaskPacket> {
  const errors: string[] = []
  if (!approval.approvalId.trim()) errors.push('approvalId is required')
  if (!approval.approvedBy.trim()) errors.push('approvedBy is required')
  const approvedAt = Date.parse(approval.approvedAt)
  const expiresAt = Date.parse(approval.expiresAt)
  if (!Number.isFinite(approvedAt)) errors.push('approvedAt is not a valid timestamp')
  if (!Number.isFinite(expiresAt)) errors.push('expiresAt is not a valid timestamp')
  if (Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && expiresAt <= approvedAt) errors.push('expiresAt must be after approvedAt')
  if (plan.planHash !== run.planHash) errors.push('the Plan does not match the Run')
  if (plan.requestId !== request.requestId) errors.push('the Plan does not belong to this Request')
  if (plan.nodes.length === 0) errors.push('the Plan has no Nodes')
  // An implementation Run without its binding cannot produce a Packet that carries one, and
  // `assertPacketMatchesNode` only compares the binding when the Run declares one — so the pair
  // would agree on `undefined` and dispatch a child with no provenance at all.
  if (run.runKind === 'implementation' && !run.implementationBinding) errors.push('the Run is an implementation Run but carries no implementationBinding')
  if (errors.length) throw new ChildPacketDerivationError(errors)

  const packets: Record<string, ApprovedTaskPacket> = {}
  for (const node of plan.nodes) {
    if (node.contextReferences.length === 0) errors.push(`${node.nodeId}: the Node has no context references to derive a Packet context from`)
    else if (!node.contextReferences.every((reference) => request.contextReferences.includes(reference))) {
      errors.push(`${node.nodeId}: the Node's context references exceed the parent Request`)
    } else {
      try {
        const packet = deriveOne(request, run, node, approval)
        // Validated here rather than at dispatch. A Packet ADF wrote itself and cannot validate is
        // an ADF bug, and the Owner should never be shown it as something to approve.
        validateApprovedTask(packet, new Date(approvedAt))
        packets[node.nodeId] = packet
      } catch (error) {
        errors.push(`${node.nodeId}: ${(error as Error).message}`)
      }
    }
  }
  if (errors.length) throw new ChildPacketDerivationError(errors)
  return packets
}
