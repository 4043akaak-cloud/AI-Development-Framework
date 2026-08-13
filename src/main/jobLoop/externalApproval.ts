import path from 'node:path'
import type { AdapterProfile, AdapterRole } from '../../shared/jobLoopTypes'
import type { ExternalPreflight, ExternalSendApproval, SyntheticPacket } from '../../shared/externalAdapterTypes'
import type { ExternalTransport } from './externalTransport'
import { readJson } from './ledger'

export class ExternalSendBlockedError extends Error {
  readonly code = 'EXTERNAL_SEND_BLOCKED'
  readonly details: string[]
  constructor(details: string[]) {
    super(`External send blocked: ${details.join('; ')}`)
    this.details = details
  }
}

/** Owner-placed approvals live outside the renderer, so nothing in ADF can create one. */
export function externalApprovalPath(runtimeRoot: string, threadId: string): string {
  return path.join(runtimeRoot, 'external-send-approvals', `${threadId}.json`)
}

export async function readExternalApproval(runtimeRoot: string, threadId: string): Promise<ExternalSendApproval | null> {
  try {
    return await readJson<ExternalSendApproval>(externalApprovalPath(runtimeRoot, threadId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export interface PreflightInput {
  profile: AdapterProfile
  /** The role the Adapter instance actually holds — never inferred from the profile's role list. */
  adapterRole: AdapterRole
  transport: ExternalTransport
  packet: SyntheticPacket
  approval: ExternalSendApproval | null
  sendsAlreadyMade: number
  now: Date
}

/**
 * Every condition the Owner should see before authorising one external send. Produces a report
 * rather than throwing, so the gate can be shown in the UI without attempting anything.
 */
export function preflightExternalSend({ profile, adapterRole, transport, packet, approval, sendsAlreadyMade, now }: PreflightInput): ExternalPreflight {
  const checks: ExternalPreflight['checks'] = []
  const blockingReasons: string[] = []

  /**
   * `detail` states the failure. Directional checks pass `passDetail` too, so a green line never
   * shows the Owner the sentence that describes it going wrong.
   */
  const require = (name: string, ok: boolean, detail: string, passDetail?: string): void => {
    checks.push({ name, status: ok ? 'pass' : 'fail', detail: ok ? passDetail ?? detail : detail })
    if (!ok) blockingReasons.push(`${name}: ${detail}`)
  }

  // local-only is not automatically zero-risk: a local-http adapter (e.g. Ollama) can be
  // misconfigured to proxy an external host, so it still passes through this same gate — just a
  // lighter one than external-send, and never through an Owner approval file (there is nothing to
  // approve per-send for a provider that never leaves the machine).
  const isLocalHttpLocalOnly = profile.dataPolicy === 'local-only' && transport.connection === 'local-http'

  require('adapter-available', profile.status === 'available', `adapter status is ${profile.status}`, 'adapter is available')
  require('packet-is-synthetic', packet.kind === 'synthetic-connectivity-probe', `packet kind is ${packet.kind}`)
  require('adapter-declares-role', profile.roles.includes(adapterRole), `adapter profile does not declare role ${adapterRole}`, `adapter profile declares role ${adapterRole}`)
  require('packet-matches-adapter-role', packet.role === adapterRole, `packet role is ${packet.role}, adapter role is ${adapterRole}`)
  require(
    'adapter-declares-external-send',
    profile.dataPolicy === 'external-send' || isLocalHttpLocalOnly,
    `data policy is ${profile.dataPolicy}`,
    isLocalHttpLocalOnly ? 'data policy is local-only over a confirmed local-http connection' : `data policy is ${profile.dataPolicy}`
  )
  require('transport-configured', transport.connection !== 'unknown', `transport connection is ${transport.connection}`)
  require(
    'profile-transport-connection-matches',
    profile.connection === transport.connection,
    `profile connection is ${profile.connection}, transport connection is ${transport.connection}`,
    `profile and transport both declare ${profile.connection}`
  )
  // Authentication belongs in front of the send, not inside it: an unset credential must disable
  // the button, not fail after the Owner has already pressed it. Presence only — never the value.
  const credential = transport.credentialStatus()
  require(
    'credential-present',
    !credential.required || credential.present,
    `no credential is set at ${credential.source}; the Owner sets it outside ADF`,
    credential.required ? `a credential is set at ${credential.source}` : `no credential is required (${credential.source})`
  )

  if (isLocalHttpLocalOnly) {
    // No Owner approval file for local-only sends: the local-endpoint check is the gate.
    const isLocal = transport.isLocalEndpoint?.() ?? false
    require(
      'local-endpoint-confirmed',
      isLocal,
      'transport target is not confirmed to be localhost / 127.0.0.1',
      'transport target is confirmed to be localhost / 127.0.0.1'
    )
  } else {
    require('owner-approval-present', Boolean(approval), approval ? `approval ${approval.approvalId}` : 'no execution approval on disk for this thread')

    if (approval) {
      require('approval-matches-thread', approval.threadId === packet.threadId && approval.taskId === packet.taskId, `approval targets ${approval.taskId} / ${approval.threadId}`)
      require('approval-matches-adapter', approval.adapterId === profile.adapterId, `approval targets adapter ${approval.adapterId}`)
      require('approval-matches-role', approval.role === adapterRole, `approval is for role ${approval.role}, this dispatch is ${adapterRole}`)
      require('approval-matches-provider', approval.provider === transport.providerId, `approval targets provider ${approval.provider}, transport is ${transport.providerId}`)
      require('approval-matches-packet', approval.packetHash === packet.packetHash, 'approval is bound to a different packet hash', 'approval is bound to this packet hash')
      // Checked separately from the packet hash so a Scope change reports as a Scope change.
      require('approval-matches-scope', approval.scopeHash === packet.scopeHash, 'the approved Scope hash does not match this thread; the Scope changed since the approval was granted', 'the approved Scope hash matches this thread')
      require('approval-matches-context', approval.contextHash === packet.contextHash, 'the approved Context hash does not match this thread', 'the approved Context hash matches this thread')
      const expiresAt = new Date(approval.expiresAt).getTime()
      require('approval-not-expired', Number.isFinite(expiresAt) && expiresAt > now.getTime(), `approval expires at ${approval.expiresAt}`)
      require('send-budget-remaining', sendsAlreadyMade < approval.maxSends, `${sendsAlreadyMade} of ${approval.maxSends} approved sends already used`)
      require('cost-tier-declared', approval.costTier !== 'unknown', `approved cost tier is ${approval.costTier}`)
    }
  }

  return {
    ok: blockingReasons.length === 0,
    provider: transport.providerId,
    adapterId: profile.adapterId,
    role: adapterRole,
    connection: transport.connection,
    costTier: approval?.costTier ?? profile.costTier,
    packetHash: packet.packetHash,
    scopeHash: packet.scopeHash,
    contextHash: packet.contextHash,
    sendsRemaining: approval ? Math.max(0, approval.maxSends - sendsAlreadyMade) : 0,
    credential,
    ...(approval ? { approvalId: approval.approvalId, expiresAt: approval.expiresAt } : {}),
    checks,
    blockingReasons
  }
}

export function assertExternalSendAllowed(preflight: ExternalPreflight): void {
  if (!preflight.ok) throw new ExternalSendBlockedError(preflight.blockingReasons)
}
