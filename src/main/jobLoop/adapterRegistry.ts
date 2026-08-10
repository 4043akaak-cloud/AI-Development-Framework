import type { AdapterCostTier, AdapterPlan, AdapterProfile, AdapterRole, AdapterSelection, Capability } from '../../shared/jobLoopTypes'

export const adapterProfiles: readonly AdapterProfile[] = [
  {
    adapterId: 'fake-ai-a',
    displayName: 'Fake AI A / Proposal',
    connection: 'fake',
    status: 'available',
    roles: ['proposal'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'local-only'
  },
  {
    adapterId: 'fake-ai-b',
    displayName: 'Fake AI B / Critic',
    connection: 'fake',
    status: 'available',
    roles: ['critic', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'local-only'
  },
  {
    adapterId: 'claude-code-first-real',
    displayName: 'Claude Code / First Real Adapter Test',
    connection: 'unknown',
    status: 'planned',
    roles: ['implementation', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'unknown'
  },
  {
    adapterId: 'claude-external',
    displayName: 'Claude / External Conversation Adapter',
    connection: 'unknown',
    status: 'planned',
    roles: ['proposal', 'critic', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'external-send'
  },
  {
    adapterId: 'codex-external',
    displayName: 'Codex / External Conversation Adapter',
    connection: 'unknown',
    status: 'planned',
    roles: ['proposal', 'critic', 'implementation'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'external-send'
  }
]

const costRank: Record<AdapterCostTier, number> = { free: 0, low: 1, medium: 2, high: 3, unknown: 99 }

export class AdapterRegistryError extends Error {
  readonly code = 'ADAPTER_REGISTRY_REJECTED'
  constructor(message: string) {
    super(message)
  }
}

export function getAdapterProfile(adapterId: string): AdapterProfile {
  const profile = adapterProfiles.find((candidate) => candidate.adapterId === adapterId)
  if (!profile) throw new AdapterRegistryError(`unknown adapter: ${adapterId}`)
  return profile
}

function supports(profile: AdapterProfile, role: AdapterRole, capabilities: Capability[], maxCostTier: AdapterCostTier): boolean {
  return profile.status === 'available'
    && profile.roles.includes(role)
    && capabilities.every((capability) => profile.capabilities.includes(capability))
    && costRank[profile.costTier] <= costRank[maxCostTier]
    && profile.dataPolicy === 'local-only'
}

export function routeAdapters(taskId: string, roles: readonly AdapterRole[], capabilities: readonly Capability[], maxCostTier: AdapterCostTier = 'free'): AdapterPlan {
  const selections: AdapterSelection[] = roles.map((role) => {
    const candidate = adapterProfiles
      .filter((profile) => supports(profile, role, [...capabilities], maxCostTier))
      .sort((left, right) => costRank[left.costTier] - costRank[right.costTier] || left.adapterId.localeCompare(right.adapterId))[0]
    if (!candidate) throw new AdapterRegistryError(`no local available adapter for role ${role} in task ${taskId}`)
    return { adapterId: candidate.adapterId, role, rationale: `${candidate.displayName} is the lowest-cost local adapter registered for ${role}` }
  })
  return { version: 'v1', selections, externalSend: false, maxCostTier }
}

export function validateAdapterPlan(plan: AdapterPlan, allowedCapabilities: readonly Capability[] = ['read', 'propose']): void {
  if (plan.version !== 'v1' || plan.externalSend !== false || !Array.isArray(plan.selections) || plan.selections.length === 0) {
    throw new AdapterRegistryError('adapter plan shape or external-send boundary is invalid')
  }
  const seenRoles = new Set<AdapterRole>()
  for (const selection of plan.selections) {
    const profile = getAdapterProfile(selection.adapterId)
    if (profile.status !== 'available') throw new AdapterRegistryError(`adapter is not available: ${selection.adapterId}`)
    if (!profile.roles.includes(selection.role)) throw new AdapterRegistryError(`adapter ${selection.adapterId} does not support role ${selection.role}`)
    if (profile.dataPolicy !== 'local-only') throw new AdapterRegistryError(`adapter ${selection.adapterId} is outside local-only MVP boundary`)
    if (!profile.capabilities.every((capability) => allowedCapabilities.includes(capability))) throw new AdapterRegistryError(`adapter ${selection.adapterId} exceeds approved capabilities`)
    if (seenRoles.has(selection.role)) throw new AdapterRegistryError(`duplicate adapter role: ${selection.role}`)
    seenRoles.add(selection.role)
  }
}
