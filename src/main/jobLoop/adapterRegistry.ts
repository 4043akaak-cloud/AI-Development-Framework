import type { AdapterCostTier, AdapterPlan, AdapterProfile, AdapterRole, AdapterSelection, Capability } from '../../shared/jobLoopTypes'
import { hashJson } from './hash'

export const adapterProfiles: readonly AdapterProfile[] = [
  {
    adapterId: 'fake-ai-a',
    displayName: 'Fake AI A / Proposal',
    provider: 'fake',
    connection: 'fake',
    authMode: 'none',
    status: 'available',
    roles: ['proposal'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'local-only'
  },
  {
    adapterId: 'fake-ai-b',
    displayName: 'Fake AI B / Critic',
    provider: 'fake',
    connection: 'fake',
    authMode: 'none',
    status: 'available',
    roles: ['critic', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'local-only'
  },
  {
    adapterId: 'claude-code-first-real',
    displayName: 'Claude Code / First Real Adapter Test',
    provider: 'anthropic',
    connection: 'unknown',
    authMode: 'unknown',
    status: 'planned',
    roles: ['implementation', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'unknown'
  },
  {
    // Connection method decided by Project Owner after the environment preflight: Messages API over
    // the built-in fetch (no CLI installed, no SDK dependency added). Dispatch still requires an
    // Owner execution approval on disk and a credential in the process environment.
    adapterId: 'claude-external',
    displayName: 'Claude / External Conversation Adapter',
    provider: 'anthropic',
    connection: 'api',
    authMode: 'environment-secret',
    status: 'available',
    roles: ['proposal', 'critic', 'review'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'external-send'
  },
  {
    // Exercises the whole external path with no network access, so the gates can be verified
    // before any provider or execution approval exists.
    adapterId: 'external-probe-mock',
    displayName: 'External Probe / Mock transport',
    provider: 'mock',
    connection: 'mock',
    authMode: 'none',
    status: 'available',
    roles: ['proposal'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'external-send'
  },
  {
    adapterId: 'codex-external',
    displayName: 'Codex / External Conversation Adapter',
    provider: 'openai',
    connection: 'unknown',
    authMode: 'unknown',
    status: 'planned',
    roles: ['proposal', 'critic', 'implementation'],
    capabilities: ['read', 'propose'],
    costTier: 'unknown',
    dataPolicy: 'external-send'
  },
  {
    // `ADF-OLLAMA-LIVE-CONNECTION-001`: available for explicit-adapterId dispatch only. `supports()`
    // still excludes `connection === 'local-http'` from auto-selection, so this flip does not let
    // ollama-local into any Fake-adapter auto-routed discussion. Dispatch also requires the calling
    // process's own `ConversationRelay` to have registered an Adapter instance for this id — the live
    // Electron app's `index.ts` does not, so the running app cannot reach it through this change alone.
    adapterId: 'ollama-local',
    displayName: 'Ollama / Local HTTP Adapter',
    provider: 'ollama',
    connection: 'local-http',
    authMode: 'none',
    status: 'available',
    roles: ['proposal', 'critic'],
    capabilities: ['read', 'propose'],
    costTier: 'free',
    dataPolicy: 'local-only'
  },
  {
    // `ADF-CLAUDE-CODE-CLI-ADAPTER-001`: `planned` only — `supports()` already requires
    // `status === 'available'`, so this entry cannot be auto-routed or explicitly dispatched to
    // regardless of `connection`. Not registered in `index.ts`'s Relay either. Registering the
    // Transport here is deliberately separate from making it reachable, mirroring how `ollama-local`
    // spent its first Task as `planned` before a later Task flipped it to `available`.
    // authMode is `environment-secret`, not `cli-session`: ClaudeCodeCliTransport always spawns with
    // `--bare`, under which the CLI's own docs state auth is strictly ANTHROPIC_API_KEY (OAuth and
    // keychain are never read) — so that is the complete, accurate description of what this Adapter
    // actually checks and actually uses, not an unconfirmed richer session model.
    adapterId: 'claude-code-cli',
    displayName: 'Claude Code CLI / External Conversation Adapter',
    provider: 'anthropic',
    connection: 'cli',
    authMode: 'environment-secret',
    status: 'planned',
    roles: ['proposal', 'critic', 'implementation', 'review'],
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

export function supports(profile: AdapterProfile, role: AdapterRole, capabilities: Capability[], maxCostTier: AdapterCostTier): boolean {
  return profile.status === 'available'
    && profile.roles.includes(role)
    && capabilities.every((capability) => profile.capabilities.includes(capability))
    && costRank[profile.costTier] <= costRank[maxCostTier]
    && profile.dataPolicy === 'local-only'
    // local-only does not mean zero-risk: a local-http adapter (e.g. Ollama) can be misconfigured to
    // proxy an external host, so it is never auto-routed. It still dispatches, but only by explicit
    // adapterId through the same preflight gate as external-send adapters (see externalApproval.ts).
    && profile.connection !== 'local-http'
}

export interface PlanMembershipResult {
  ok: boolean
  detail: string
}

/**
 * The single check for "is this explicit adapterId/role dispatch actually what the Owner approved" —
 * shared by the read-only preflight report (`externalApproval.ts`) and the real dispatch gate
 * (`relay.ts`), so the two can never drift into checking different things. Verifies the Plan's own
 * integrity first (`adapterPlan` must still hash to the `routingPlanHash` the Owner's approval is
 * bound to — catches a stale or tampered Thread/Packet), then that the named adapterId/role is one of
 * the approved selections.
 */
export function checkAdapterPlanMembership(adapterPlan: AdapterPlan, routingPlanHash: string, adapterId: string, role: AdapterRole): PlanMembershipResult {
  if (hashJson(adapterPlan) !== routingPlanHash) {
    return { ok: false, detail: 'adapterPlan does not match its routingPlanHash (stale or tampered)' }
  }
  const selection = adapterPlan.selections.find((candidate) => candidate.adapterId === adapterId)
  if (!selection) return { ok: false, detail: `Task Packet adapterPlan does not include ${adapterId}` }
  if (selection.role !== role) return { ok: false, detail: `Task Packet adapterPlan approves ${adapterId} for role ${selection.role}, not ${role}` }
  return { ok: true, detail: `adapterPlan approves ${adapterId} for role ${role}, routingPlanHash verified` }
}

/**
 * Builds an `AdapterPlan` naming exactly one Owner-chosen adapterId for one role, instead of letting
 * `routeAdapters` auto-select. Provider-neutral: works for any registered `local-only` adapter, not
 * just Ollama. Deliberately still requires `dataPolicy === 'local-only'`, the same MVP boundary
 * `validateAdapterPlan` enforces on every selection — an external-send adapter is never eligible here
 * either, so this cannot become a second way to smuggle one into an approved local Plan.
 */
export function buildExplicitAdapterPlan(taskId: string, adapterId: string, role: AdapterRole, capabilities: readonly Capability[], maxCostTier: AdapterCostTier = 'free'): AdapterPlan {
  const profile = getAdapterProfile(adapterId)
  if (profile.status !== 'available') throw new AdapterRegistryError(`adapter is not available: ${adapterId} (status: ${profile.status})`)
  // Checked ahead of role/capabilities/cost: the local-only MVP boundary is the fundamental gate an
  // explicit Owner choice cannot bypass, not a tiebreaker among otherwise-eligible adapters.
  if (profile.dataPolicy !== 'local-only') throw new AdapterRegistryError(`adapter ${adapterId} is outside local-only MVP boundary`)
  if (!profile.roles.includes(role)) throw new AdapterRegistryError(`adapter ${adapterId} does not support role ${role}`)
  if (!capabilities.every((capability) => profile.capabilities.includes(capability))) {
    throw new AdapterRegistryError(`adapter ${adapterId} does not support the requested capabilities for task ${taskId}`)
  }
  if (costRank[profile.costTier] > costRank[maxCostTier]) throw new AdapterRegistryError(`adapter ${adapterId} exceeds the maximum cost tier ${maxCostTier}`)
  return {
    version: 'v1',
    selections: [{ adapterId, role, rationale: `Explicit adapterId approved by Owner for role ${role} in task ${taskId} (not auto-routed)` }],
    externalSend: false,
    maxCostTier
  }
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
