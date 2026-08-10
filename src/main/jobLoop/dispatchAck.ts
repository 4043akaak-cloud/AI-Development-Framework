import type { ApprovedTaskPacket, Capability, DispatchAck, DispatchPacket, DispatchTarget } from '../../shared/jobLoopTypes'
import { hashJson, nowIso } from './hash'

export interface DispatchReceiver {
  receive(packet: DispatchPacket): DispatchAck | null
}

export class DispatchBlockedError extends Error {
  readonly code = 'DISPATCH_BLOCKED'
  readonly details: string[]

  constructor(details: string[]) {
    super(`Blocked / Delivery not confirmed: ${details.join('; ')}`)
    this.details = details
  }
}

function packetContent(packet: ApprovedTaskPacket): Omit<DispatchPacket, 'packetHash'> {
  const dispatchId = `dispatch-${hashJson([packet.taskId, packet.scopeHash, packet.contextHash, packet.target, packet.adapter]).slice(0, 24)}`
  return {
    dispatchId,
    taskId: packet.taskId,
    scopeHash: packet.scopeHash,
    contextHash: packet.contextHash,
    target: packet.target,
    capabilities: [...packet.approval.capabilities],
    acceptance: [...packet.acceptance],
    stopConditions: [...packet.stopConditions],
    adapter: packet.adapter,
    adapterPlan: packet.adapterPlan
  }
}

export function createDispatchPacket(packet: ApprovedTaskPacket): DispatchPacket {
  const content = packetContent(packet)
  return { ...content, packetHash: hashJson(content) }
}

function same(valueA: unknown, valueB: unknown): boolean {
  return hashJson(valueA) === hashJson(valueB)
}

function targetMismatches(expected: DispatchTarget, actual: DispatchTarget | undefined): string[] {
  if (!actual) return ['ack target is missing']
  const errors: string[] = []
  for (const key of ['repository', 'branch', 'worktree', 'allowedFiles', 'forbiddenChanges'] as const) {
    if (!same(expected[key], actual[key])) errors.push(`target ${key} mismatch`)
  }
  return errors
}

export function validateDispatchAck(packet: DispatchPacket, ack: DispatchAck | null): void {
  if (!ack) throw new DispatchBlockedError(['ack is missing'])
  const errors: string[] = []
  if (ack.status !== 'acknowledged') errors.push(`ack status is ${ack.status}`)
  if (ack.dispatchId !== packet.dispatchId) errors.push('dispatchId mismatch')
  if (ack.taskId !== packet.taskId) errors.push('taskId mismatch')
  if (ack.packetHash !== packet.packetHash) errors.push('packet hash mismatch')
  if (ack.acceptedScopeHash !== packet.scopeHash) errors.push('scope hash mismatch')
  if (!same(ack.acceptedCapabilities, packet.capabilities)) errors.push('capability grant mismatch')
  errors.push(...targetMismatches(packet.target, ack.target))
  if (errors.length) throw new DispatchBlockedError(errors)
}

export class FakeDispatchReceiver implements DispatchReceiver {
  constructor(private readonly mutate?: (ack: DispatchAck) => DispatchAck | null) {}

  receive(packet: DispatchPacket): DispatchAck | null {
    const ack: DispatchAck = {
      dispatchId: packet.dispatchId,
      taskId: packet.taskId,
      packetHash: packet.packetHash,
      acceptedScopeHash: packet.scopeHash,
      acceptedCapabilities: [...packet.capabilities] as Capability[],
      target: packet.target,
      status: 'acknowledged',
      receivedAt: nowIso()
    }
    return this.mutate ? this.mutate(ack) : ack
  }
}
