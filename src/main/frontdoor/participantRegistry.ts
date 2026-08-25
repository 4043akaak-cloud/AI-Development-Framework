import type { Capability } from '../../shared/jobLoopTypes'
import { hashJson } from '../jobLoop/hash'
import type { DecompositionNode } from '../../shared/frontdoorTypes'
import type { ParticipantProfile, ParticipantRole } from '../../shared/participantTypes'

/**
 * Registry of possible AI participants. These profiles describe capabilities,
 * not permanent roles. The same participant may be assigned as frontdoor,
 * specialist, reviewer, or integrator by an approved Phase/Task plan.
 */
export const participantProfiles: readonly ParticipantProfile[] = [
  {
    participantId: 'codex',
    displayName: 'Codex',
    connection: 'mcp',
    status: 'available',
    roles: ['frontdoor', 'specialist', 'reviewer', 'integrator'],
    capabilities: ['read', 'propose'],
    dataPolicy: 'local-only'
  },
  {
    participantId: 'cursor',
    displayName: 'Cursor',
    connection: 'mcp',
    status: 'available',
    roles: ['frontdoor', 'specialist', 'reviewer', 'integrator'],
    capabilities: ['read', 'propose'],
    dataPolicy: 'unknown'
  },
  {
    participantId: 'claude-code',
    displayName: 'Claude Code',
    connection: 'cli',
    status: 'planned',
    roles: ['frontdoor', 'specialist', 'reviewer', 'integrator'],
    capabilities: ['read', 'propose'],
    dataPolicy: 'external-send'
  }
]

export class ParticipantRegistryError extends Error {
  readonly code = 'PARTICIPANT_REGISTRY_REJECTED'
}

export function getParticipantProfile(participantId: string): ParticipantProfile {
  const profile = participantProfiles.find((candidate) => candidate.participantId === participantId)
  if (!profile) throw new ParticipantRegistryError(`unknown participant: ${participantId}`)
  return profile
}

export function validateParticipantAssignment(participantId: string, role: ParticipantRole, capabilities: readonly Capability[]): void {
  const profile = getParticipantProfile(participantId)
  if (profile.status !== 'available') throw new ParticipantRegistryError(`participant is not available: ${participantId}`)
  if (!profile.roles.includes(role)) throw new ParticipantRegistryError(`participant ${participantId} does not support role ${role}`)
  if (!capabilities.every((capability) => profile.capabilities.includes(capability))) {
    throw new ParticipantRegistryError(`participant ${participantId} does not support the requested capabilities`)
  }
}

export function participantAssignmentId(runId: string, node: Pick<DecompositionNode, 'nodeId' | 'participantAssignment'>): string {
  const assignment = node.participantAssignment
  if (!assignment) throw new ParticipantRegistryError(`node has no participant assignment: ${node.nodeId}`)
  return assignment.assignmentId ?? `assignment-${hashJson([runId, node.nodeId, assignment]).slice(0, 24)}`
}
